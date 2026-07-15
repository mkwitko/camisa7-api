/**
 * One team's final score in a `MatchResult` — `team` is the same 0-based
 * index `TeamSplit.team` uses (see `children/teams/teams.types.ts`), so a
 * score can be cross-checked against a match's persisted `TeamAssignment`.
 */
export type TeamScore = { team: number; goals: number };

/**
 * Domain `MatchResult` — not the Prisma row. The owner-recorded final score
 * for a `Match`; one per match (`upsert` is keyed by `matchId`, see
 * `result.repository.ts`, so a mistaken entry is corrected by resubmitting
 * rather than accumulating history). `winnerTeam` is the winning team's
 * index, or `null` for a draw. `recordedAt` is the Prisma row's `updatedAt`
 * (every `upsert` bumps it, whether the first recording or a correction) —
 * same convention `TeamAssignment.generatedAt` uses.
 */
export type MatchResult = {
  id: string;
  matchId: string;
  scores: TeamScore[];
  winnerTeam: number | null;
  recordedById: string;
  recordedAt: string;
};
