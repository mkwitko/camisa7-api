import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { ReputationRepository } from "../reputation.repository";
import type { VoterTag } from "../reputation.types";

export type SetReputationDeps = {
  matchesRepo: MatchesRepository;
  attendanceRepo: AttendanceRepository;
  reputationRepo: ReputationRepository;
  /** Injectable clock — defaults to `() => new Date()`. Mirrors `cast-vote`'s 48h window (see `cast-vote.service.ts`). */
  now?: () => Date;
};

export type SetReputationInput = { matchId: string; userId: string; tags: VoterTag[] };

const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * A confirmed attendee replaces their FULL reputation-tag set for a match.
 * Rules mirror `cast-vote.service.ts` exactly (same error catalog, same
 * order), extended to validate EVERY `votedPlayerId` in `tags` instead of a
 * single candidate:
 *
 * 1. `ERRORS.MTC.NOT_FOUND()` (404) for an unknown match id.
 * 2. The caller must be a CONFIRMED attendee — `ERRORS.VOTE.NOT_PARTICIPANT()`
 *    (403) otherwise.
 * 3. Every `tags[].votedPlayerId` must also be a confirmed attendee —
 *    `ERRORS.VOTE.INVALID_CANDIDATE()` (400) otherwise (checked per tag,
 *    same per-candidate order as cast-vote: candidate-confirmed before
 *    self-vote).
 * 4. No tag may target the voter themselves — `ERRORS.VOTE.SELF_VOTE()` (400).
 * 5. Voting window: the match must already be `finished`, and `now()` must
 *    be within 48h of the match's `datetime` — `ERRORS.VOTE.WINDOW_CLOSED()`
 *    (409) otherwise. Checked LAST, after every tag has been validated —
 *    same position as in `cast-vote.service.ts`.
 *
 * Each tag's `dimensions` are deduped (`[...new Set(...)]`) before being
 * handed to `reputationRepo.replaceForVoter` — `ReputationTag` has a unique
 * constraint on `(matchId, voterPlayerId, votedPlayerId, dimension)`, so a
 * duplicate dimension in the request would otherwise hit a P2002 error.
 *
 * Returns the deduped tag set that was actually stored, so the controller
 * can echo it back without a second repo round-trip.
 */
export function createSetReputationService(deps: SetReputationDeps) {
  const now = deps.now ?? (() => new Date());

  return async (input: SetReputationInput): Promise<VoterTag[]> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");

    const voterAttendance = confirmed.find((a) => a.player.userId === input.userId);
    if (!voterAttendance) throw ERRORS.VOTE.NOT_PARTICIPANT();
    const voterPlayerId = voterAttendance.player.id;

    const confirmedIds = new Set(confirmed.map((a) => a.player.id));
    const dedupedTags: VoterTag[] = input.tags.map((tag) => ({
      votedPlayerId: tag.votedPlayerId,
      dimensions: [...new Set(tag.dimensions)],
    }));

    for (const tag of dedupedTags) {
      if (!confirmedIds.has(tag.votedPlayerId)) throw ERRORS.VOTE.INVALID_CANDIDATE();
      if (tag.votedPlayerId === voterPlayerId) throw ERRORS.VOTE.SELF_VOTE();
    }

    const deadline = new Date(new Date(match.datetime).getTime() + VOTING_WINDOW_MS);
    if (match.status !== "finished" || now() > deadline) {
      throw ERRORS.VOTE.WINDOW_CLOSED();
    }

    await deps.reputationRepo.replaceForVoter(input.matchId, voterPlayerId, dedupedTags);
    return dedupedTags;
  };
}
