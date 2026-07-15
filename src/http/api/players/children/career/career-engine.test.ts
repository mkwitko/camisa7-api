import { describe, expect, it } from "vitest";
import type { MatchPerformance } from "./career.types";
import { CAREER_CONFIG } from "./career-config";
import { computeCareer } from "./career-engine";

function perf(overrides: Partial<MatchPerformance> = {}): MatchPerformance {
  return {
    matchId: "m1",
    datetime: "2026-01-01T20:00:00.000Z",
    position: "atacante",
    secondaryPositions: [],
    seedOverall: {},
    outcome: "draw",
    goals: 0,
    assists: 0,
    ownGoals: 0,
    cleanSheet: false,
    mvpVotes: 0,
    craqueVotes: 0,
    melhorGoleiroVotes: 0,
    ...overrides,
  };
}

describe("computeCareer", () => {
  it("bootstraps a brand-new position from the config default when no seedOverall entry exists", () => {
    const result = computeCareer([]);

    expect(result.overall).toEqual({});
    expect(result.level).toBe("bronze");
    expect(result.matchesPlayed).toBe(0);
  });

  it("bootstraps from the group's seedOverall on the first touched match", () => {
    const result = computeCareer([
      perf({ matchId: "m1", seedOverall: { atacante: 60 }, outcome: "draw" }),
    ]);

    // draw contributes +1 (CAREER_CONFIG.weights.draw), capped step applies.
    expect(result.overall.atacante).toBe(60 + CAREER_CONFIG.weights.draw);
  });

  it("uses the neutral bootstrap default when the group never seeded the position", () => {
    const result = computeCareer([perf({ matchId: "m1", outcome: "draw", seedOverall: {} })]);

    expect(result.overall.atacante).toBe(
      CAREER_CONFIG.bootstrapDefaultOverall + CAREER_CONFIG.weights.draw,
    );
  });

  it("trends up on a win with goals", () => {
    const result = computeCareer([
      perf({ matchId: "m1", seedOverall: { atacante: 50 }, outcome: "win", goals: 2 }),
    ]);

    expect(result.overall.atacante).toBeGreaterThan(50);
    // Bounded by the per-match step cap even though the raw signal (win + 2 goals) is much larger.
    expect(result.overall.atacante).toBe(50 + CAREER_CONFIG.perMatchStepCap);
  });

  it("trends down on a loss with an own goal", () => {
    const result = computeCareer([
      perf({ matchId: "m1", seedOverall: { atacante: 50 }, outcome: "loss", ownGoals: 1 }),
    ]);

    expect(result.overall.atacante).toBeLessThan(50);
    expect(result.overall.atacante).toBe(50 - CAREER_CONFIG.perMatchStepCap);
  });

  it("never moves a position by more than perMatchStepCap in a single match, however big the raw signal", () => {
    const modestResult = computeCareer([
      perf({ matchId: "m1", seedOverall: { atacante: 50 }, outcome: "win", goals: 1 }),
    ]);
    const hugeResult = computeCareer([
      perf({
        matchId: "m1",
        seedOverall: { atacante: 50 },
        outcome: "win",
        goals: 10,
        assists: 10,
        mvpVotes: 5,
        craqueVotes: 5,
      }),
    ]);

    expect(modestResult.overall.atacante).toBe(50 + CAREER_CONFIG.perMatchStepCap);
    expect(hugeResult.overall.atacante).toBe(50 + CAREER_CONFIG.perMatchStepCap);
  });

  it("clamps overall to the 0-99 range even from an extreme seed", () => {
    const high = computeCareer([perf({ seedOverall: { atacante: 99 }, outcome: "win", goals: 5 })]);
    const low = computeCareer([
      perf({ seedOverall: { atacante: 0 }, outcome: "loss", ownGoals: 5 }),
    ]);

    expect(high.overall.atacante).toBeLessThanOrEqual(99);
    expect(low.overall.atacante).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic — identical input (any order) produces identical output", () => {
    const performances = [
      perf({
        matchId: "m1",
        datetime: "2026-01-01T20:00:00.000Z",
        seedOverall: { atacante: 50 },
        outcome: "win",
        goals: 2,
      }),
      perf({ matchId: "m2", datetime: "2026-01-08T20:00:00.000Z", outcome: "loss" }),
      perf({ matchId: "m3", datetime: "2026-01-15T20:00:00.000Z", outcome: "draw", assists: 1 }),
    ];

    const forward = computeCareer(performances);
    const shuffled = computeCareer([
      performances[2] as MatchPerformance,
      performances[0] as MatchPerformance,
      performances[1] as MatchPerformance,
    ]);

    expect(shuffled).toEqual(forward);
  });

  it("is idempotent — recomputing from the same match history twice yields the same career", () => {
    const performances = [
      perf({
        matchId: "m1",
        datetime: "2026-01-01T20:00:00.000Z",
        seedOverall: { atacante: 50 },
        outcome: "win",
        goals: 2,
      }),
      perf({
        matchId: "m2",
        datetime: "2026-01-08T20:00:00.000Z",
        outcome: "win",
        goals: 1,
        mvpVotes: 1,
      }),
    ];

    const first = computeCareer(performances);
    const second = computeCareer(performances);

    expect(second).toEqual(first);
  });

  it("replays matches in chronological order, not insertion order, so the sequence of steps matters", () => {
    const early = perf({
      matchId: "early",
      datetime: "2026-01-01T20:00:00.000Z",
      seedOverall: { atacante: 50 },
      outcome: "win",
      goals: 2,
    });
    const late = perf({
      matchId: "late",
      datetime: "2026-02-01T20:00:00.000Z",
      outcome: "loss",
      ownGoals: 1,
    });

    // Given out of order — the engine must still process `early` (which carries the bootstrap seed) first.
    const result = computeCareer([late, early]);

    // early: 50 -> 53 (capped +3 win+goals); late: 53 -> 50 (capped -3 loss+ownGoal)
    expect(result.overall.atacante).toBe(50);
  });

  it("moves secondary positions toward the same signal at a reduced factor, independent of the primary", () => {
    // A plain draw (no goals/assists/votes) keeps the raw signal well under
    // the step cap for BOTH primary and secondary, so the
    // `secondaryPositionFactor` scaling is actually visible instead of both
    // saturating at the same capped value.
    const result = computeCareer([
      perf({
        matchId: "m1",
        position: "atacante",
        secondaryPositions: ["meia"],
        seedOverall: { atacante: 50, meia: 50 },
        outcome: "draw",
      }),
    ]);

    expect(result.overall.atacante).toBeGreaterThan(50);
    // Secondary position is nudged toward the same signal scaled down — still moves, but less.
    expect(result.overall.meia).toBeGreaterThan(50);
    expect(result.overall.meia).toBeLessThan(result.overall.atacante as number);
  });

  it("only applies clean-sheet/melhor_goleiro credit to the goleiro position", () => {
    const goleiro = computeCareer([
      perf({
        matchId: "m1",
        position: "goleiro",
        seedOverall: { goleiro: 50 },
        outcome: "draw",
        cleanSheet: true,
        melhorGoleiroVotes: 1,
      }),
    ]);
    const atacanteWithCleanSheetFlag = computeCareer([
      perf({
        matchId: "m1",
        position: "atacante",
        seedOverall: { atacante: 50 },
        outcome: "draw",
        cleanSheet: true,
        melhorGoleiroVotes: 1,
      }),
    ]);

    expect(goleiro.overall.goleiro).toBeGreaterThan(
      atacanteWithCleanSheetFlag.overall.atacante as number,
    );
  });

  it("aggregates matchesPlayed/wins/draws/losses/goals/assists/cleanSheets/mvpCount across the replay", () => {
    const result = computeCareer([
      perf({
        matchId: "m1",
        datetime: "2026-01-01T20:00:00.000Z",
        outcome: "win",
        goals: 2,
        assists: 1,
        mvpVotes: 1,
      }),
      perf({
        matchId: "m2",
        datetime: "2026-01-08T20:00:00.000Z",
        position: "goleiro",
        outcome: "draw",
        cleanSheet: true,
      }),
      perf({ matchId: "m3", datetime: "2026-01-15T20:00:00.000Z", outcome: "loss" }),
    ]);

    expect(result.matchesPlayed).toBe(3);
    expect(result.wins).toBe(1);
    expect(result.draws).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.goals).toBe(2);
    expect(result.assists).toBe(1);
    expect(result.cleanSheets).toBe(1);
    expect(result.mvpCount).toBe(1);
  });

  it("tracks currentStreak as the trailing unbeaten run and bestStreak as its historical max", () => {
    const result = computeCareer([
      perf({ matchId: "m1", datetime: "2026-01-01T20:00:00.000Z", outcome: "win" }),
      perf({ matchId: "m2", datetime: "2026-01-08T20:00:00.000Z", outcome: "win" }),
      perf({ matchId: "m3", datetime: "2026-01-15T20:00:00.000Z", outcome: "loss" }),
      perf({ matchId: "m4", datetime: "2026-01-22T20:00:00.000Z", outcome: "win" }),
      perf({ matchId: "m5", datetime: "2026-01-29T20:00:00.000Z", outcome: "draw" }),
    ]);

    expect(result.bestStreak).toBe(2); // the first win-win run
    expect(result.currentStreak).toBe(2); // win, draw since the loss
  });

  it("derives level bronze/prata/ouro from the best per-position overall, crossing thresholds via a bounded step", () => {
    const staysOuro = computeCareer([perf({ seedOverall: { atacante: 90 }, outcome: "loss" })]); // 90 -> 87
    const dropsToOuroFloor = computeCareer([
      perf({ seedOverall: { atacante: 87 }, outcome: "loss" }),
    ]); // 87 -> 84
    const dropsToBronze = computeCareer([perf({ seedOverall: { atacante: 72 }, outcome: "loss" })]); // 72 -> 69

    expect(staysOuro.level).toBe("ouro");
    expect(dropsToOuroFloor.level).toBe("prata");
    expect(dropsToBronze.level).toBe("bronze");
  });
});
