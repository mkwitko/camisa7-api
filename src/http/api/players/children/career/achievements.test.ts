import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, unlockedAchievements } from "./achievements";

const zero = {
  matchesPlayed: 0,
  wins: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  mvpCount: 0,
  bestStreak: 0,
};

describe("unlockedAchievements", () => {
  it("returns the full catalog, all locked at zero", () => {
    const a = unlockedAchievements(zero);
    expect(a).toHaveLength(ACHIEVEMENTS.length);
    expect(a.every((x) => !x.unlocked)).toBe(true);
  });

  it("unlocks by threshold (gol tiers + jogos + mvp)", () => {
    const a = unlockedAchievements({ ...zero, goals: 55, matchesPlayed: 60, mvpCount: 1 });
    const on = new Set(a.filter((x) => x.unlocked).map((x) => x.key));
    expect(on.has("primeiro_gol")).toBe(true);
    expect(on.has("goleador_10")).toBe(true);
    expect(on.has("artilheiro_50")).toBe(true);
    expect(on.has("matador_100")).toBe(false);
    expect(on.has("jogos_50")).toBe(true);
    expect(on.has("jogos_100")).toBe(false);
    expect(on.has("mvp_1")).toBe(true);
  });
});
