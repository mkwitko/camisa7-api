import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { ReputationRepository } from "../reputation.repository";
import type { VoterTag } from "../reputation.types";

export type GetReputationDeps = {
  matchesRepo: MatchesRepository;
  attendanceRepo: AttendanceRepository;
  reputationRepo: ReputationRepository;
};

export type GetReputationInput = { matchId: string; userId: string };

/**
 * Returns the caller's OWN reputation-tag set for a match. Same
 * participant-authz gap as `cast-vote`/`set-reputation`: `ERRORS.MTC.NOT_FOUND()`
 * (404) for an unknown match, `ERRORS.VOTE.NOT_PARTICIPANT()` (403) if the
 * caller isn't a confirmed attendee. No voting-window check — reading back
 * what you already submitted (or an empty list) is always allowed, mirroring
 * `list-vote-tally`'s read-only stance.
 */
export function createGetReputationService(deps: GetReputationDeps) {
  return async (input: GetReputationInput): Promise<VoterTag[]> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");

    const voterAttendance = confirmed.find((a) => a.player.userId === input.userId);
    if (!voterAttendance) throw ERRORS.VOTE.NOT_PARTICIPANT();
    const voterPlayerId = voterAttendance.player.id;

    return deps.reputationRepo.listByVoter(input.matchId, voterPlayerId);
  };
}
