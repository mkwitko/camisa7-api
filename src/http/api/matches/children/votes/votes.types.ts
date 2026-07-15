/**
 * Domain `VoteCategory` — mirrors the Prisma `VoteCategory` enum values
 * (same "plain string union" rationale as `MatchStatSource`/`AttendanceStatus`
 * elsewhere: callers don't depend on the generated Prisma client's types).
 */
export type VoteCategory = "mvp" | "melhor_goleiro" | "craque" | "fair_play";

/** Fixed display/iteration order for the 4 categories — used by `tallyByMatch` so every category is always present in its result, even with zero votes. */
export const VOTE_CATEGORIES: readonly VoteCategory[] = [
  "mvp",
  "melhor_goleiro",
  "craque",
  "fair_play",
];

/**
 * Domain `Vote` — not the Prisma row. One player's vote, for one category,
 * on one `Match`. `cast-vote` upserts keyed by `(matchId, voterPlayerId,
 * category)` (`VotesRepository.upsert`), so changing your mind within the
 * 48h voting window corrects the same row rather than accumulating history
 * (same "upsert to correct" convention `MatchResult`/`MatchStat` use).
 * Individual votes are never exposed back over the API in aggregate form —
 * only `cast-vote`'s own response (confirming the caller's own just-cast
 * vote) and the internal `listByMatch` (feeds the F1-4 career-growth
 * engine) read this shape; `list-vote-tally` returns `CategoryTally[]`
 * instead, which never carries `voterPlayerId`.
 */
export type Vote = {
  id: string;
  matchId: string;
  voterPlayerId: string;
  category: VoteCategory;
  votedPlayerId: string;
  createdAt: string;
  updatedAt: string;
};

/** One candidate's vote count within a category tally. */
export type CategoryTallyEntry = { playerId: string; votes: number };

/**
 * Aggregated result for one `VoteCategory` on one match — `tally` is sorted
 * by `votes` desc (ties broken by `playerId` for determinism), and
 * `leaderPlayerId` is the single top candidate, or `null` when there are no
 * votes yet OR when two or more candidates tie for the top spot (an
 * ambiguous "leader" isn't reported as one).
 */
export type CategoryTally = {
  category: VoteCategory;
  tally: CategoryTallyEntry[];
  leaderPlayerId: string | null;
};
