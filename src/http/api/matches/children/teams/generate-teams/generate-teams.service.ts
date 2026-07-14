import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { Position } from "@/http/api/groups/children/members/members.types";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../../attendance/attendance.repository";
import { type BalancerPlayer, balanceTeams } from "../balancer";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment } from "../teams.types";

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

/** A guest attendee with no `GroupMember` row in this group (e.g. joined via invite, see `InviteToken`'s doc comment) gets a neutral default rating. */
const DEFAULT_PRIMARY_POS: Position = "meia";
const DEFAULT_OVERALL = 50;

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
      const primaryPos = member?.primaryPos ?? DEFAULT_PRIMARY_POS;
      const overall = member?.seedOverall[primaryPos] ?? DEFAULT_OVERALL;
      return {
        playerId: attendance.player.id,
        name: attendance.player.name,
        primaryPos,
        overall,
        isGoalkeeper: primaryPos === "goleiro",
      };
    });
    const nameById = new Map(balancerPlayers.map((p) => [p.playerId, p.name]));

    const { teams } = balanceTeams(balancerPlayers, input.teamCount);
    const teamSplits = teams.map((t) => ({
      team: t.team,
      players: t.playerIds.map((playerId) => ({
        playerId,
        name: nameById.get(playerId) as string,
      })),
    }));

    return deps.teamsRepo.save(input.matchId, teamSplits);
  };
}
