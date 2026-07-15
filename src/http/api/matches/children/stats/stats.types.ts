/**
 * Domain `MatchStatSource` — mirrors the Prisma `MatchStatSource` enum
 * values. Fase 1 (F1-2) only ever writes `"organizador"` (the owner logs
 * gols/assist/clean_sheet via `log-stats`); `"colaborativo"` (jogadores
 * reportam + consenso/disputa, `stat_report`) is a later fase — the value
 * exists now so this column never needs a widening migration when that
 * feature lands (see §4.2/§9 of the Fase 0+1 design doc).
 */
export type MatchStatSource = "organizador" | "colaborativo";

/**
 * Domain `MatchStat` — not the Prisma row. One player's stat line for one
 * `Match`; `log-stats` upserts a batch of these keyed by
 * `(matchId, playerId)` (`MatchStatsRepository.upsertMany`), so re-logging
 * the same player corrects the row rather than accumulating history (same
 * "upsert to correct" convention `MatchResult`/`TeamAssignment` use).
 * `team` is the same 0-based index `TeamScore.team`/`TeamSplit.team` use —
 * optional since not every group runs `generate-teams` before logging
 * stats. `cleanSheet` only makes sense for a goalkeeper but isn't itself
 * constrained to `Position.goleiro` (not validated at all in Fase 1 —
 * YAGNI, the organizer is trusted). `listByPlayer` (career-wide, ignores
 * `matchId`) feeds the F1-4 career-growth engine (`player_career`, §6 of
 * the design doc).
 */
export type MatchStat = {
  id: string;
  matchId: string;
  playerId: string;
  team: number | null;
  goals: number;
  assists: number;
  ownGoals: number;
  cleanSheet: boolean;
  source: MatchStatSource;
  createdAt: string;
  updatedAt: string;
};
