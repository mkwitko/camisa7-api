import type { Position } from "@/http/api/groups/children/members/members.types";

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
  overall: Partial<Record<Position, number>>;
  affinity: Partial<Record<Position, number>>;
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
 * `MatchResult` + `Vote` + the match's `GroupMember` row — see that file's
 * doc comment for how each field is derived. `computeCareer` itself sorts
 * this list chronologically (by `datetime`, ties broken by `matchId`) — the
 * caller doesn't need to pre-sort, which is what makes a re-run
 * order-independent (idempotent) regardless of the order the repository
 * happens to fetch rows in.
 */
export type MatchPerformance = {
  matchId: string;
  /** ISO 8601 — the match's own `datetime`, not when stats/votes/result were recorded. */
  datetime: string;
  /** The player's primary position in the match's group at recompute time (Fase 1 has no historical position snapshot). */
  position: Position;
  /** The player's secondary positions in that same group — nudged too, at a reduced weight (see `career-config.ts`). */
  secondaryPositions: Position[];
  /** That match's group's `seedOverall` — the bootstrap starting point the FIRST time a position is touched during replay. */
  seedOverall: Partial<Record<Position, number>>;
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
  overall: Partial<Record<Position, number>>;
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
