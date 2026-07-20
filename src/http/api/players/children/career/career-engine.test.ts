import { describe, expect, it } from "vitest";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import { generalOverallFrom } from "@/http/api/players/players.rating";
import { CAREER_CONFIG } from "./career-config";
import { computeCareer } from "./career-engine";
import type { MatchPerformance } from "./career.types";

const base = withAttributeDefaults({});
const affinity = { campo_atacante: 100 };

function perf(over: Partial<MatchPerformance> = {}): MatchPerformance {
  return {
    matchId: over.matchId ?? "m1",
    datetime: over.datetime ?? "2026-01-01T00:00:00.000Z",
    affinity,
    outcome: over.outcome ?? "win",
    goals: over.goals ?? 0,
    assists: over.assists ?? 0,
    ownGoals: over.ownGoals ?? 0,
    cleanSheet: over.cleanSheet ?? false,
    mvpVotes: over.mvpVotes ?? 0,
    craqueVotes: over.craqueVotes ?? 0,
    melhorGoleiroVotes: over.melhorGoleiroVotes ?? 0,
  };
}

describe("computeCareer (attribute growth)", () => {
  it("no matches → evolved attributes equal the base", () => {
    const c = computeCareer({ baseAttributes: base, affinity, performances: [] });
    expect(c.attributes).toEqual(base);
    expect(c.matchesPlayed).toBe(0);
  });

  it("appearances grow the position's attributes over the base", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      perf({ matchId: `m${i}`, datetime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, outcome: "draw" }),
    );
    const c = computeCareer({ baseAttributes: base, affinity, performances: many });
    // finalizacao is heavily weighted for atacante — must have grown.
    expect(c.attributes.finalizacao).toBeGreaterThan(base.finalizacao as number);
  });

  it("goals grow finalizacao specifically", () => {
    const c = computeCareer({ baseAttributes: base, affinity, performances: [perf({ goals: 3 })] });
    expect(c.attributes.finalizacao).toBeGreaterThan(base.finalizacao as number);
  });

  it("assists grow passe specifically", () => {
    const c = computeCareer({ baseAttributes: base, affinity, performances: [perf({ assists: 3 })] });
    expect(c.attributes.passe_curto).toBeGreaterThan(base.passe_curto as number);
  });

  it("caps overall movement per match", () => {
    const monster = perf({ goals: 20, assists: 20, mvpVotes: 20 });
    const c = computeCareer({ baseAttributes: base, affinity, performances: [monster] });
    const before = generalOverallFrom(base, affinity);
    const after = generalOverallFrom(c.attributes, affinity);
    expect(after - before).toBeLessThanOrEqual(CAREER_CONFIG.growth.perMatchStepCap + 1);
  });

  it("is deterministic regardless of input order", () => {
    const a = perf({ matchId: "a", datetime: "2026-01-01T00:00:00.000Z", goals: 2 });
    const b = perf({ matchId: "b", datetime: "2026-01-02T00:00:00.000Z", goals: 1 });
    const x = computeCareer({ baseAttributes: base, affinity, performances: [a, b] });
    const y = computeCareer({ baseAttributes: base, affinity, performances: [b, a] });
    expect(x.attributes).toEqual(y.attributes);
  });

  it("is idempotent", () => {
    const ps = [perf({ goals: 2 }), perf({ matchId: "m2", datetime: "2026-02-01T00:00:00.000Z", assists: 1 })];
    expect(computeCareer({ baseAttributes: base, affinity, performances: ps }).attributes).toEqual(
      computeCareer({ baseAttributes: base, affinity, performances: ps }).attributes,
    );
  });

  it("losses never drop evolved below base", () => {
    const losses = Array.from({ length: 5 }, (_, i) =>
      perf({ matchId: `l${i}`, datetime: `2026-03-0${i + 1}T00:00:00.000Z`, outcome: "loss", ownGoals: 2 }),
    );
    const c = computeCareer({ baseAttributes: base, affinity, performances: losses });
    for (const k of Object.keys(base))
      expect(c.attributes[k]).toBeGreaterThanOrEqual((base[k] as number) - 0);
  });

  it("guest (no base attributes) falls back to baseline defaults", () => {
    const c = computeCareer({ affinity, performances: [perf()] });
    // baseline 50 filled for every key; grew from there.
    expect(c.attributes.finalizacao).toBeGreaterThanOrEqual(50);
  });

  it("derives level from best evolved position overall", () => {
    const strongBase = withAttributeDefaults(
      Object.fromEntries(Object.keys(base).map((k) => [k, 99])),
    );
    const c = computeCareer({ baseAttributes: strongBase, affinity, performances: [] });
    expect(c.level).toBe("ouro");
  });
});
