import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { MatchResultRepository } from "@/http/api/matches/children/result/result.repository";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";

export type FinalizeMatchCoreDeps = {
  matchesRepo: MatchesRepository;
  resultRepo: MatchResultRepository;
  attendanceRepo: AttendanceRepository;
  careerRepo: PlayerCareerRepository;
};

/**
 * The owner-agnostic core of "finalize a match" — shared by the owner-gated
 * HTTP endpoint (`finalize-match.service.ts`, which wraps this with
 * `assertMatchOwner`) and the system cron
 * (`src/jobs/finalize-matches.job.ts`, which has no acting user at all).
 *
 * Requires the match to already be `"finished"` (via `finish-match`) with a
 * `MatchResult` recorded (via `record-result`) — `ERRORS.MTC.NOT_FINALIZABLE()`
 * (409) / `ERRORS.RES.NOT_FOUND()` (404) otherwise. Sets `status: "closed"`
 * (closing voting, §5.2 step 11 of the design doc) and recomputes
 * `PlayerCareer` (via `PlayerCareerRepository.recomputeForPlayer` — see
 * §6/the growth engine) for every CONFIRMED attendee.
 *
 * Idempotent: calling this again on an already-`"closed"` match skips the
 * status transition (a no-op, `match.status` stays `"closed"`) but still
 * re-runs the career recompute for every confirmed participant — safe
 * because `recomputeForPlayer` always replays the player's FULL finalized
 * match history from scratch rather than incrementally applying a delta
 * (see `career-engine.ts`'s doc comment), so re-finalizing produces the
 * exact same `PlayerCareer` values, never double-counts.
 */
export function createFinalizeMatchCore(deps: FinalizeMatchCoreDeps) {
  return async (matchId: string): Promise<Match> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    if (match.status !== "finished" && match.status !== "closed") {
      throw ERRORS.MTC.NOT_FINALIZABLE();
    }

    const result = await deps.resultRepo.findByMatch(matchId);
    if (!result) throw ERRORS.RES.NOT_FOUND();

    const closed =
      match.status === "closed" ? match : await deps.matchesRepo.setStatus(matchId, "closed");

    const attendances = await deps.attendanceRepo.listByMatch(matchId);
    const confirmedPlayerIds = [
      ...new Set(attendances.filter((a) => a.status === "confirmed").map((a) => a.player.id)),
    ];

    for (const playerId of confirmedPlayerIds) {
      await deps.careerRepo.recomputeForPlayer(playerId);
    }

    return closed;
  };
}
