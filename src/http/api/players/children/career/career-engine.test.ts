import { describe, expect, it } from "vitest";
import type { MatchPerformance } from "./career.types";
import { CAREER_CONFIG } from "./career-config";
import { computeCareer } from "./career-engine";

function perf(overrides: Partial<MatchPerformance> = {}): MatchPerformance {
  return {
    matchId: "m1",
    datetime: "2026-01-01T20:00:00.000Z",
    affinity: { campo_atacante: 50 },
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

describe("computeCareer — goalkeeper recognition by role", () => {
  it("credits clean sheet + melhor_goleiro only to a *_goleiro field position", () => {
    const gk = computeCareer([
      perf({
        matchId: "m1",
        affinity: { campo_goleiro: 50 },
        cleanSheet: true,
        melhorGoleiroVotes: 2,
      }),
    ]);
    const outfield = computeCareer([
      perf({
        matchId: "m1",
        affinity: { campo_atacante: 50 },
        cleanSheet: true,
        melhorGoleiroVotes: 2,
      }),
    ]);
    // GK gets the clean-sheet + melhor_goleiro bonus; the outfield slug ignores both.
    expect(gk.overall.campo_goleiro as number).toBeGreaterThan(
      outfield.overall.campo_atacante as number,
    );
  });
});

describe("computeCareer (FM affinity model)", () => {
  it("returns an empty career for no match history", () => {
    const result = computeCareer([]);

    expect(result.overall).toEqual({});
    expect(result.level).toBe("bronze");
    expect(result.matchesPlayed).toBe(0);
  });

  it("bootstraps a declared position from the player's own affinity, then steps by the affinity-scaled signal", () => {
    // draw-only signal (CAREER_CONFIG.weights.draw = 1) scaled by 80% affinity
    // = 0.8, rounds to a +1 step off the affinity-80 bootstrap.
    const result = computeCareer([perf({ affinity: { campo_atacante: 80 }, outcome: "draw" })]);

    expect(result.overall.campo_atacante).toBe(81);
  });

  it("moves a higher-affinity position more than a lower-affinity one for the same underlying signal", () => {
    // draw(1) + 2 assists(2 each = 4) = raw signal 5.
    const perfArgs = { outcome: "draw" as const, assists: 2 };
    const high = computeCareer([perf({ ...perfArgs, affinity: { campo_atacante: 80 } })]);
    const low = computeCareer([perf({ ...perfArgs, affinity: { campo_atacante: 40 } })]);

    // high: 5 * 0.8 = 4.0, capped to +3 -> 80 + 3 = 83.
    expect(high.overall.campo_atacante).toBe(83);
    // low: 5 * 0.4 = 2.0, under the cap -> 40 + 2 = 42.
    expect(low.overall.campo_atacante).toBe(42);
    // Movement off each one's own bootstrap: high moved further than low.
    expect((high.overall.campo_atacante as number) - 80).toBeGreaterThan(
      (low.overall.campo_atacante as number) - 40,
    );
  });

  it("never touches a position that isn't declared in affinity (absent or zero)", () => {
    const absent = computeCareer([perf({ affinity: {}, outcome: "win", goals: 3, mvpVotes: 1 })]);
    const zero = computeCareer([
      perf({ affinity: { campo_atacante: 0 }, outcome: "win", goals: 3, mvpVotes: 1 }),
    ]);

    expect(absent.overall).toEqual({});
    expect(zero.overall).toEqual({});
    // Counters still aggregate — only the position-level `overall` is gated.
    expect(absent.matchesPlayed).toBe(1);
  });

  it("only ever moves the positions actually declared, even when other stats are extreme", () => {
    const result = computeCareer([
      perf({ affinity: { campo_meia: 60 }, outcome: "win", goals: 10, assists: 10, mvpVotes: 5 }),
    ]);

    expect(Object.keys(result.overall)).toEqual(["campo_meia"]);
    expect(result.overall.campo_atacante).toBeUndefined();
  });

  it("applies clean-sheet/melhor_goleiro credit to the campo_goleiro position only when campo_goleiro is declared", () => {
    const goleiroDeclared = computeCareer([
      perf({
        affinity: { campo_goleiro: 70 },
        outcome: "draw",
        cleanSheet: true,
        melhorGoleiroVotes: 1,
      }),
    ]);
    const goleiroNotDeclared = computeCareer([
      perf({
        affinity: { campo_atacante: 70 },
        outcome: "draw",
        cleanSheet: true,
        melhorGoleiroVotes: 1,
      }),
    ]);

    // campo_goleiro: draw(1) + cleanSheet(5) + melhorGoleiro(3) = 9, * 70% = 6.3, capped +3 -> 73.
    expect(goleiroDeclared.overall.campo_goleiro).toBe(73);
    // campo_atacante gets no GK bonus even though the perf carries cleanSheet/melhorGoleiroVotes:
    // draw(1) only, * 70% = 0.7, rounds to +1 -> 71.
    expect(goleiroNotDeclared.overall.campo_atacante).toBe(71);
    expect(goleiroNotDeclared.overall.campo_goleiro).toBeUndefined();
  });

  it("never moves a position by more than perMatchStepCap in a single match, however big the raw signal", () => {
    const modest = computeCareer([perf({ affinity: { campo_atacante: 50 }, outcome: "win", goals: 1 })]);
    const huge = computeCareer([
      perf({
        affinity: { campo_atacante: 50 },
        outcome: "win",
        goals: 10,
        assists: 10,
        mvpVotes: 5,
        craqueVotes: 5,
      }),
    ]);

    expect(modest.overall.campo_atacante).toBe(50 + CAREER_CONFIG.perMatchStepCap);
    expect(huge.overall.campo_atacante).toBe(50 + CAREER_CONFIG.perMatchStepCap);
  });

  it("clamps the affinity bootstrap itself to 99, even at the max declared affinity of 100", () => {
    const result = computeCareer([perf({ affinity: { campo_atacante: 100 }, outcome: "loss" })]);

    // bootstrap clamp(100, 0, 99) = 99, then a loss (-6 * 100% = -6, capped -3) -> 96.
    expect(result.overall.campo_atacante).toBe(96);
  });

  it("clamps overall to the 0-99 range even after an extreme step", () => {
    const high = computeCareer([perf({ affinity: { campo_atacante: 99 }, outcome: "win", goals: 5 })]);
    const low = computeCareer([perf({ affinity: { campo_atacante: 1 }, outcome: "loss", ownGoals: 5 })]);

    expect(high.overall.campo_atacante).toBeLessThanOrEqual(99);
    expect(low.overall.campo_atacante).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic — identical performances (any order) produce identical output", () => {
    const performances = [
      perf({
        matchId: "m1",
        datetime: "2026-01-01T20:00:00.000Z",
        affinity: { campo_atacante: 50 },
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
        affinity: { campo_atacante: 50 },
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
      affinity: { campo_atacante: 50 },
      outcome: "win",
      goals: 2,
    });
    const late = perf({
      matchId: "late",
      datetime: "2026-02-01T20:00:00.000Z",
      outcome: "loss",
      ownGoals: 1,
    });

    // Given out of order — the engine must still process `early` (which carries the bootstrap affinity) first.
    const result = computeCareer([late, early]);

    // early: 50 -> 53 (capped +3 win+goals); late: 53 -> 50 (capped -3 loss+ownGoal)
    expect(result.overall.campo_atacante).toBe(50);
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
        affinity: { campo_goleiro: 50 },
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
    const staysOuro = computeCareer([perf({ affinity: { campo_atacante: 90 }, outcome: "loss" })]); // 90 -> 87
    const dropsToOuroFloor = computeCareer([perf({ affinity: { campo_atacante: 87 }, outcome: "loss" })]); // 87 -> 84
    const dropsToBronze = computeCareer([perf({ affinity: { campo_atacante: 72 }, outcome: "loss" })]); // 72 -> 69

    expect(staysOuro.level).toBe("ouro");
    expect(dropsToOuroFloor.level).toBe("prata");
    expect(dropsToBronze.level).toBe("bronze");
  });
});
