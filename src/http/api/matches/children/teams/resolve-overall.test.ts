import { describe, expect, it } from "vitest";
import { MODALITY_POSITIONS } from "@/http/api/groups/children/members/members.types";
import {
  affinityFor,
  DEFAULT_OVERALL,
  DEFAULT_PRIMARY_POS,
  resolveOverall,
} from "./resolve-overall";

describe("resolveOverall (FM: affinity × overall)", () => {
  it("neutral default when no affinity declared", () => {
    expect(resolveOverall({})).toEqual({
      primaryPos: DEFAULT_PRIMARY_POS,
      overall: DEFAULT_OVERALL,
    });
  });

  it("bootstraps overall from affinity when no career yet", () => {
    // eff = clamp(80) = 80; score = 0.8 * 80 = 64
    expect(resolveOverall({ atacante: 80 })).toEqual({ primaryPos: "atacante", overall: 80 });
  });

  it("picks position with the highest affinity × overall (bootstrap)", () => {
    // atacante: 0.8*80=64  vs  goleiro: 0.6*60=36  → atacante
    expect(resolveOverall({ atacante: 80, goleiro: 60 })).toEqual({
      primaryPos: "atacante",
      overall: 80,
    });
  });

  it("uses career overall over the affinity bootstrap, and picks by affinity × career", () => {
    // atacante: 0.5*95 = 47.5  vs  meia: 0.9*60 = 54  → meia, overall 60
    const career = { atacante: 95, meia: 60 } as const;
    expect(resolveOverall({ atacante: 50, meia: 90 }, career)).toEqual({
      primaryPos: "meia",
      overall: 60,
    });
  });

  it("ignores positions with affinity 0", () => {
    expect(resolveOverall({ atacante: 0, goleiro: 70 })).toEqual({
      primaryPos: "goleiro",
      overall: 70,
    });
  });

  it("caps the affinity bootstrap at 99", () => {
    // affinity 100 → eff clamped to 99
    expect(resolveOverall({ atacante: 100 })).toEqual({ primaryPos: "atacante", overall: 99 });
  });
});

describe("resolveOverall — modality filter", () => {
  it("restricts candidates to the allowed modality positions", () => {
    const affinity = { campo_atacante: 100, futsal_pivo: 100 };
    expect(resolveOverall(affinity, undefined, MODALITY_POSITIONS.futsal).primaryPos).toBe(
      "futsal_pivo",
    );
  });

  it("falls back to the neutral default when no allowed position is declared", () => {
    const r = resolveOverall({ campo_atacante: 100 }, undefined, MODALITY_POSITIONS.futsal);
    expect(r).toEqual({ primaryPos: DEFAULT_PRIMARY_POS, overall: DEFAULT_OVERALL });
  });
});

describe("affinityFor", () => {
  it("prefers the player's own non-empty affinity", () => {
    expect(affinityFor({ atacante: 80 }, { goleiro: 50 })).toEqual({ atacante: 80 });
  });

  it("falls back to the member's affinity when the player's is empty", () => {
    expect(affinityFor({}, { goleiro: 50 })).toEqual({ goleiro: 50 });
  });

  it("returns empty when neither has affinity", () => {
    expect(affinityFor(undefined, undefined)).toEqual({});
  });
});
