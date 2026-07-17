import { describe, expect, it } from "vitest";
import { ATTRIBUTE_BUDGET, ATTRIBUTE_KEYS } from "@/http/api/players/players.catalog";
import { UpdateMyPlayerBody } from "./me.schema";

/** All-50 baseline plus the 20 bonus on the first key — sums to ATTRIBUTE_BUDGET. */
const baselineAttributes = {
  ...Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 50])),
  [ATTRIBUTE_KEYS[0] as string]: 70,
} as Record<string, number>;

describe("UpdateMyPlayerBody affinity vocabulary", () => {
  it("accepts modality-scoped position keys", () => {
    expect(
      UpdateMyPlayerBody.safeParse({ affinity: { campo_atacante: 99, futsal_pivo: 75 } }).success,
    ).toBe(true);
  });

  it("rejects legacy generic position keys", () => {
    expect(UpdateMyPlayerBody.safeParse({ affinity: { atacante: 99 } }).success).toBe(false);
  });
});

describe("UpdateMyPlayerBody", () => {
  it("accepts an empty body (all fields optional)", () => {
    expect(UpdateMyPlayerBody.safeParse({}).success).toBe(true);
  });

  it("accepts a redistributed budget that still sums to the budget", () => {
    const [a, b] = ATTRIBUTE_KEYS;
    const attrs = { ...baselineAttributes, [a as string]: 90, [b as string]: 30 }; // 70+50 -> 90+30, same sum
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(true);
  });

  it("rejects a budget that does not sum to the budget", () => {
    const attrs = { ...baselineAttributes, [ATTRIBUTE_KEYS[1] as string]: 99 }; // adds points
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(false);
  });

  it("rejects an incomplete catalog", () => {
    const { [ATTRIBUTE_KEYS[0] as string]: _drop, ...missingOne } = baselineAttributes;
    void _drop;
    expect(UpdateMyPlayerBody.safeParse({ attributes: missingOne }).success).toBe(false);
  });

  it("rejects an attribute value above 99", () => {
    const attrs = { ...baselineAttributes, [ATTRIBUTE_KEYS[0] as string]: 120 };
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(false);
  });

  it("accepts up to 5 distinct skills from the catalog", () => {
    const parsed = UpdateMyPlayerBody.safeParse({
      skills: ["tecnica", "veloz", "dominio", "malvadeza", "cabeca_fria"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects more than 5 skills", () => {
    const parsed = UpdateMyPlayerBody.safeParse({
      skills: ["tecnica", "veloz", "dominio", "malvadeza", "cabeca_fria", "acrobata"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate skills", () => {
    const parsed = UpdateMyPlayerBody.safeParse({ skills: ["tecnica", "tecnica"] });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown skill", () => {
    const parsed = UpdateMyPlayerBody.safeParse({ skills: ["capoeirista"] });
    expect(parsed.success).toBe(false);
  });

  it("checks a full valid attribute budget parses", () => {
    const sum = Object.values(baselineAttributes).reduce((a, b) => a + b, 0);
    expect(sum).toBe(ATTRIBUTE_BUDGET);
    expect(UpdateMyPlayerBody.safeParse({ attributes: baselineAttributes }).success).toBe(true);
  });
});
