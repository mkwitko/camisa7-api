import { MODALITY_POSITIONS } from "@/http/api/groups/children/members/members.types";
import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { overallByPositionFrom } from "@/http/api/players/players.rating";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../../attendance/attendance.repository";
import { affinityFor, resolveOverall } from "../resolve-overall";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment, TeamSplit } from "../teams.types";

export type UpdateTeamsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  membersRepo: MembersRepository;
  teamsRepo: TeamsRepository;
  careerRepo: PlayerCareerRepository;
};

export type UpdateTeamsInput = {
  matchId: string;
  userId: string;
  teams: { team: number; playerIds: string[] }[];
};

/**
 * Owner manually overrides the team split (e.g. after `generate-teams`
 * picked something the owner wants to hand-tweak). Validates that every
 * *currently confirmed* attendee appears in the submitted roster exactly
 * once — no missing player, no duplicate, no unknown `playerId` (someone
 * not confirmed, or not even part of this match) — throwing
 * `ERRORS.TEAM.INVALID_ROSTER()` (400) otherwise. `save` is the same
 * upsert-by-`matchId` `generate-teams` uses, so a manual override replaces
 * whatever split (generated or previously overridden) already existed.
 *
 * Each player's `overall` (and each team's `overallTotal`) is recomputed
 * from the match's group `GroupMember` rows the same way `generate-teams`
 * does (`resolveOverall` — same default for a confirmed guest with no
 * membership row), so a manual override keeps the same totals contract as a
 * fresh generation instead of leaving stale/absent numbers behind.
 */
export function createUpdateTeamsService(deps: UpdateTeamsDeps) {
  return async (input: UpdateTeamsInput): Promise<TeamAssignment> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, input.userId);

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");
    const nameByConfirmedId = new Map(confirmed.map((a) => [a.player.id, a.player.name]));

    const submittedIds = input.teams.flatMap((t) => t.playerIds);
    const uniqueSubmittedIds = new Set(submittedIds);
    if (uniqueSubmittedIds.size !== submittedIds.length) {
      throw ERRORS.TEAM.INVALID_ROSTER({ reason: "duplicate_player" });
    }

    const confirmedIds = new Set(nameByConfirmedId.keys());
    const missing = [...confirmedIds].filter((id) => !uniqueSubmittedIds.has(id));
    const unknown = [...uniqueSubmittedIds].filter((id) => !confirmedIds.has(id));
    if (missing.length > 0 || unknown.length > 0) {
      throw ERRORS.TEAM.INVALID_ROSTER({ reason: "roster_mismatch", missing, unknown });
    }

    const members = await deps.membersRepo.listByGroup(asserted.groupId);
    const memberByPlayerId = new Map(members.map((m) => [m.player.id, m]));
    const careers = await Promise.all(
      confirmed.map((a) => deps.careerRepo.findByPlayer(a.player.id)),
    );
    const careerOverallByPlayerId = new Map(
      confirmed.map((a, i) => {
        const c = careers[i];
        return [a.player.id, c ? overallByPositionFrom(c.attributes, c.affinity) : undefined];
      }),
    );
    const overallByConfirmedId = new Map(
      confirmed.map((a) => {
        const member = memberByPlayerId.get(a.player.id);
        const affinity = affinityFor(a.player.affinity, member?.affinity);
        return [
          a.player.id,
          resolveOverall(
            affinity,
            careerOverallByPlayerId.get(a.player.id),
            MODALITY_POSITIONS[asserted.modality],
          ).overall,
        ];
      }),
    );

    const teamSplits: TeamSplit[] = input.teams.map((t) => {
      const players = t.playerIds.map((playerId) => ({
        playerId,
        name: nameByConfirmedId.get(playerId) as string,
        overall: overallByConfirmedId.get(playerId) as number,
      }));
      return {
        team: t.team,
        overallTotal: players.reduce((sum, p) => sum + p.overall, 0),
        players,
      };
    });

    return deps.teamsRepo.save(input.matchId, teamSplits);
  };
}
