import {
  FIELD_POSITIONS,
  type FieldPosition,
  isGoalkeeper,
} from "@/http/api/groups/children/members/members.types";
import { effectiveBase } from "@/http/api/players/players.rating";
import type { ComputedCareer, MatchOutcome, MatchPerformance, PlayerLevel } from "./career.types";
import { CAREER_CONFIG } from "./career-config";

/** Clamps `value` to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The per-match "signal" a `position`'s `overall` moves toward — a weighted
 * sum of result + attacking output + (goalkeeper-gated) clean sheet/votes +
 * MVP/craque votes, per `CAREER_CONFIG.weights`. Positive = "played better
 * than their current overall suggests", negative = worse. `fair_play` votes
 * never appear here (§6 of the design doc: reputation-only, not technical
 * overall — see `career-config.ts`'s comment on `weights`).
 */
function computeSignal(position: FieldPosition, perf: MatchPerformance): number {
  const w = CAREER_CONFIG.weights;
  const outcomeWeight: Record<MatchOutcome, number> = { win: w.win, draw: w.draw, loss: w.loss };

  let signal = outcomeWeight[perf.outcome];
  signal += perf.goals * w.goal;
  signal += perf.assists * w.assist;
  signal += perf.ownGoals * w.ownGoal;
  signal += perf.mvpVotes * w.mvpVote;
  signal += perf.craqueVotes * w.craqueVote;

  // Goalkeeper-specific recognition only counts toward the goleiro position
  // — a clean sheet or a "melhor goleiro" vote says nothing about how well
  // someone played as, say, atacante in a different group.
  if (isGoalkeeper(position)) {
    if (perf.cleanSheet) signal += w.cleanSheet;
    signal += perf.melhorGoleiroVotes * w.melhorGoleiroVote;
  }

  return signal;
}

/**
 * Moves `current` toward `signal`, bounded by `CAREER_CONFIG.perMatchStepCap`
 * either direction, then rounded to a whole point (both `overall` and
 * `affinity` are integer scales — see `OverallValueSchema`/
 * `AffinityValueSchema` — but `signal` here is generally fractional once
 * scaled by `affinity / 100`), clamped to the valid 0-99 overall range.
 */
function stepToward(current: number, signal: number): number {
  const step = clamp(signal, -CAREER_CONFIG.perMatchStepCap, CAREER_CONFIG.perMatchStepCap);
  return clamp(current + Math.round(step), 0, 99);
}

/**
 * `overall[position]` if already touched during this replay, else the
 * starting value for `position`: the attribute-derived `effectiveBase`
 * (attributes × affinity) when the player's `attributes` are known, otherwise
 * the raw declared `affinity[position]` (clamped 0-99). Only ever called for a
 * `position` already gated on `affinity[position] > 0`.
 */
function bootstrap(
  overall: Partial<Record<FieldPosition, number>>,
  position: FieldPosition,
  affinity: Partial<Record<FieldPosition, number>>,
  attributes: Record<string, number> | undefined,
): number {
  const current = overall[position];
  if (current !== undefined) return current;
  if (attributes) return effectiveBase(attributes, position, affinity[position] ?? 0);
  return clamp(affinity[position] ?? 0, 0, 99);
}

/** The player's best per-position `overall`, or `undefined` if no position has been touched yet. */
function bestOverall(overall: Partial<Record<FieldPosition, number>>): number | undefined {
  const values = Object.values(overall).filter((v): v is number => v !== undefined);
  return values.length > 0 ? Math.max(...values) : undefined;
}

/** Derives `PlayerLevel` from the player's best `overall` via `CAREER_CONFIG.levelThresholds`. `bronze` when no position has been touched (brand-new career). */
function deriveLevel(overall: Partial<Record<FieldPosition, number>>): PlayerLevel {
  const best = bestOverall(overall);
  if (best === undefined) return "bronze";
  if (best >= CAREER_CONFIG.levelThresholds.ouro) return "ouro";
  if (best >= CAREER_CONFIG.levelThresholds.prata) return "prata";
  return "bronze";
}

/**
 * The F1-4 growth engine — PURE, DETERMINISTIC, IDEMPOTENT. Replays
 * `performances` (a player's entire finalized match history, unsorted —
 * this function sorts) in chronological order and returns the resulting
 * `ComputedCareer`. Never reads or mutates a previously-stored career value:
 * `PlayerCareerRepository.recomputeForPlayer` calls this with the FULL
 * history every time, so calling it twice with the same input always
 * produces the same output (idempotent), and the result never depends on
 * the order matches were fetched in (deterministic) — only on `datetime`.
 *
 * Task 2 (FM rating model): per match, for EACH position `p` with
 * `perf.affinity[p] > 0` — the player's own self-declared affinity, see
 * `MatchPerformance`'s doc comment — `overall[p]` moves toward
 * `computeSignal(p, perf)` scaled by `affinity[p] / 100`. High affinity
 * (the player rates themselves strongly at `p`) moves `overall[p]` more per
 * match than low affinity; a position absent from `affinity` (or declared
 * at `0`) is NEVER touched, no matter how the match went. `bootstrap`
 * seeds a position's starting value from that SAME declared `affinity[p]`
 * the FIRST time replay reaches it (clamped to 0-99) — every match after
 * that moves from the already-computed value, never re-reads the
 * affinity. Because affinity isn't a historical per-match snapshot (Fase 1
 * has none), every match in a replay uses the player's CURRENT declared
 * affinity — changing it and re-finalizing shifts the whole replayed
 * career, not just future matches.
 */
export function computeCareer(performances: MatchPerformance[]): ComputedCareer {
  const sorted = [...performances].sort(
    (a, b) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime() ||
      a.matchId.localeCompare(b.matchId),
  );

  const overall: Partial<Record<FieldPosition, number>> = {};

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goals = 0;
  let assists = 0;
  let cleanSheets = 0;
  let mvpCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;

  for (const perf of sorted) {
    for (const position of FIELD_POSITIONS) {
      const affinityValue = perf.affinity[position];
      if (!affinityValue || affinityValue <= 0) continue; // undeclared (or 0) — never touched

      const signal = computeSignal(position, perf) * (affinityValue / 100);
      overall[position] = stepToward(
        bootstrap(overall, position, perf.affinity, perf.attributes),
        signal,
      );
    }

    if (perf.outcome === "win") wins += 1;
    else if (perf.outcome === "draw") draws += 1;
    else losses += 1;

    goals += perf.goals;
    assists += perf.assists;
    if (perf.cleanSheet) cleanSheets += 1;
    mvpCount += perf.mvpVotes;

    currentStreak = perf.outcome === "loss" ? 0 : currentStreak + 1;
    bestStreak = Math.max(bestStreak, currentStreak);
  }

  return {
    overall,
    level: deriveLevel(overall),
    matchesPlayed: sorted.length,
    wins,
    draws,
    losses,
    goals,
    assists,
    cleanSheets,
    mvpCount,
    currentStreak,
    bestStreak,
  };
}
