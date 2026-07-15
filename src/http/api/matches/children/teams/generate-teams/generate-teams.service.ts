import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../../attendance/attendance.repository";
import { type BalancerPlayer, balanceTeams } from "../balancer";
import { resolveOverall } from "../resolve-overall";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment, TeamSplit } from "../teams.types";

export type GenerateTeamsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  membersRepo: MembersRepository;
  teamsRepo: TeamsRepository;
};

export type GenerateTeamsInput = {
  matchId: string;
  userId: string;
  teamCount: number;
};

/**
 * Owner generates (or regenerates — this always overwrites via `save`'s
 * upsert) a balanced team split for their own match. Only `confirmed`
 * attendees are considered (waitlisted/cancelled never make the cut);
 * `ERRORS.TEAM.NOT_ENOUGH_PLAYERS()` (409) if fewer than 2. Each confirmed
 * attendee's rating comes from the match's group's `GroupMember` row for
 * that same `Player` (`overall = seedOverall[primaryPos] ?? 50`,
 * `isGoalkeeper = primaryPos === "goleiro"`) — a confirmed guest with no
 * membership in this group (possible via the public invite flow, Task 9)
 * falls back to `primaryPos: "meia"` / `overall: 50`.
 */
export function createGenerateTeamsService(deps: GenerateTeamsDeps) {
  return async (input: GenerateTeamsInput): Promise<TeamAssignment> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, input.userId);

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");
    if (confirmed.length < 2) throw ERRORS.TEAM.NOT_ENOUGH_PLAYERS();

    const members = await deps.membersRepo.listByGroup(asserted.groupId);
    const memberByPlayerId = new Map(members.map((m) => [m.player.id, m]));

    const balancerPlayers: BalancerPlayer[] = confirmed.map((attendance) => {
      const member = memberByPlayerId.get(attendance.player.id);
      const { primaryPos, overall } = resolveOverall(member);
      return {
        playerId: attendance.player.id,
        name: attendance.player.name,
        primaryPos,
        overall,
        isGoalkeeper: primaryPos === "goleiro",
      };
    });
    const infoById = new Map(balancerPlayers.map((p) => [p.playerId, p]));

    const { teams, overallByTeam } = balanceTeams(balancerPlayers, input.teamCount);
    const teamSplits: TeamSplit[] = teams.map((t) => ({
      team: t.team,
      overallTotal: overallByTeam[t.team] ?? 0, // unreachable: one entry per team, indexed by team number
      players: t.playerIds.map((playerId) => {
        const info = infoById.get(playerId);
        return {
          playerId,
          name: info?.name as string,
          overall: info?.overall as number,
        };
      }),
    }));

    return deps.teamsRepo.save(input.matchId, teamSplits);
  };
}
