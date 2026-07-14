import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../../attendance/attendance.repository";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment } from "../teams.types";

export type UpdateTeamsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  teamsRepo: TeamsRepository;
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
 */
export function createUpdateTeamsService(deps: UpdateTeamsDeps) {
  return async (input: UpdateTeamsInput): Promise<TeamAssignment> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, input.userId);

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

    const teamSplits = input.teams.map((t) => ({
      team: t.team,
      players: t.playerIds.map((playerId) => ({
        playerId,
        name: nameByConfirmedId.get(playerId) as string,
      })),
    }));

    return deps.teamsRepo.save(input.matchId, teamSplits);
  };
}
