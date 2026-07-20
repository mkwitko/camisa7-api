import type { FieldPosition } from "@/http/api/groups/children/members/members.types";

/**
 * Domain `PlayerLevel` — mirrors the Prisma `PlayerLevel` enum values as a
 * plain string union (same rationale as `MatchStatus`/`Position` elsewhere).
 * Derived (never set directly) from the player's best per-position
 * `overall` via `career-config.ts`'s `LEVEL_THRESHOLDS`.
 */
export type PlayerLevel = "bronze" | "prata" | "ouro";

/**
 * Domain `PlayerCareer` — not the Prisma row. The GLOBAL identity of a
 * player (§4.2 of the design doc) — 1:1 with `Player`, materialized for any
 * player (registered or guest). `overall`/`affinity` are maps keyed by
 * `Position` (0-99 / 0-100) — `affinity` is player-declared (out of this
 * task's scope) and the growth engine never writes it, only `overall`.
 * Grows via `PlayerCareerRepository.recomputeForPlayer`, which replays the
 * player's entire finalized match history through the pure
 * `computeCareer` engine (`career-engine.ts`) — never incrementally
 * mutated, so recomputing twice from the same match history yields the
 * same row (idempotent).
 */
export type PlayerCareer = {
  id: string;
  playerId: string;
  /** Evolved attribute map (declared base + career-earned growth), 0-99 per key. Drives every overall. */
  attributes: Record<string, number>;
  /** The player's declared position affinity at last recompute — for deriving the overall map. */
  affinity: Partial<Record<FieldPosition, number>>;
  level: PlayerLevel;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  mvpCount: number;
  currentStreak: number;
  bestStreak: number;
  updatedAt: string;
};

/** A player's result for their own team in one finalized match. */
export type MatchOutcome = "win" | "draw" | "loss";

/**
 * One finalized match's inputs to the growth engine, already resolved by
 * `PlayerCareerRepository`'s `gatherPerformances` from `MatchStat` +
 * `MatchResult` + `Vote` + the player's declared `affinity` at recompute
 * time — see that file's doc comment for how each field is derived.
 * Base attributes are supplied once by the repository (not per-match).
 * `computeCareer` itself sorts this list chronologically (by `datetime`,
 * ties broken by `matchId`) — the caller doesn't need to pre-sort, which is
 * what makes a re-run order-independent (idempotent) regardless of the
 * order the repository happens to fetch rows in.
 */
export type MatchPerformance = {
  matchId: string;
  /** ISO 8601 — the match's own `datetime`, not when stats/votes/result were recorded. */
  datetime: string;
  /**
   * The player's own self-declared affinity (`{position: 0-100}`) at
   * recompute time — `Player.affinity` if registered, else that match's
   * `GroupMember.affinity` for a guest (see `career.repository.ts`'s
   * `gatherPerformances`). The FM rating model (Task 2): every position
   * with a positive affinity here moves toward this match's signal, scaled
   * by `affinity[position] / 100` — a position absent or at `0` is never
   * touched. Not a historical snapshot: Fase 1 has no per-match affinity
   * record, so a re-finalize replays with whatever the player has declared
   * NOW, for every match in their history alike.
   */
  affinity: Partial<Record<FieldPosition, number>>;
  /** The player's own team's result — `"draw"` when it can't be resolved (no `MatchResult`, or the stat row carries no `team`). */
  outcome: MatchOutcome;
  goals: number;
  assists: number;
  ownGoals: number;
  cleanSheet: boolean;
  mvpVotes: number;
  craqueVotes: number;
  melhorGoleiroVotes: number;
};

/**
 * The growth engine's pure output — everything `PlayerCareerRepository`
 * persists onto the `PlayerCareer` row EXCEPT `affinity` (player-declared,
 * untouched by the engine — see `PlayerCareer`'s doc comment).
 */
export type ComputedCareer = {
  attributes: Record<string, number>;
  affinity: Partial<Record<FieldPosition, number>>;
  level: PlayerLevel;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  mvpCount: number;
  currentStreak: number;
  bestStreak: number;
};
