import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { VotesRepository } from "../votes.repository";
import type { Vote, VoteCategory } from "../votes.types";

export type CastVoteDeps = {
  matchesRepo: MatchesRepository;
  attendanceRepo: AttendanceRepository;
  votesRepo: VotesRepository;
  /** Injectable clock — defaults to `() => new Date()`. Lets tests exercise the 48h voting window deterministically without waiting on real time. */
  now?: () => Date;
};

export type CastVoteInput = {
  matchId: string;
  userId: string;
  category: VoteCategory;
  votedPlayerId: string;
};

const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * A confirmed attendee casts (or changes) their vote for one category on a
 * match. Rules, checked in this order:
 *
 * 1. `ERRORS.MTC.NOT_FOUND()` (404) for an unknown match id.
 * 2. The caller must be a CONFIRMED attendee of the match — resolved by
 *    matching their `userId` against the match's confirmed attendances'
 *    `player.userId` (mirrors `log-stats`'s confirmed-attendee lookup).
 *    `ERRORS.VOTE.NOT_PARTICIPANT()` (403) otherwise.
 * 3. `votedPlayerId` must also be a confirmed attendee of the match —
 *    `ERRORS.VOTE.INVALID_CANDIDATE()` (400) otherwise.
 * 4. Voter !== voted (no self-vote) — `ERRORS.VOTE.SELF_VOTE()` (400).
 * 5. Voting window: the match must already be `finished`, and `now()` must
 *    be within 48h of the match's `datetime` — `ERRORS.VOTE.WINDOW_CLOSED()`
 *    (409) otherwise. `now` is injectable (defaults to real time) so tests
 *    can exercise "expired window" without simulating the passage of time —
 *    seed a match with a `datetime` far enough in the past instead.
 *
 * `upsert` is keyed by `(matchId, voterPlayerId, category)` — casting again
 * for the same category corrects the same row (changing your vote within
 * the window), never accumulates a second row.
 */
export function createCastVoteService(deps: CastVoteDeps) {
  const now = deps.now ?? (() => new Date());

  return async (input: CastVoteInput): Promise<Vote> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");

    const voterAttendance = confirmed.find((a) => a.player.userId === input.userId);
    if (!voterAttendance) throw ERRORS.VOTE.NOT_PARTICIPANT();
    const voterPlayerId = voterAttendance.player.id;

    const votedIsConfirmed = confirmed.some((a) => a.player.id === input.votedPlayerId);
    if (!votedIsConfirmed) throw ERRORS.VOTE.INVALID_CANDIDATE();

    if (voterPlayerId === input.votedPlayerId) throw ERRORS.VOTE.SELF_VOTE();

    const deadline = new Date(new Date(match.datetime).getTime() + VOTING_WINDOW_MS);
    if (match.status !== "finished" || now() > deadline) {
      throw ERRORS.VOTE.WINDOW_CLOSED();
    }

    return deps.votesRepo.upsert(input.matchId, voterPlayerId, input.category, input.votedPlayerId);
  };
}
