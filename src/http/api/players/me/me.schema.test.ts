import { describe, expect, it } from "vitest";
import { ATTRIBUTE_KEYS } from "@/http/api/players/players.catalog";
import { UpdateMyPlayerBody } from "./me.schema";

/** All-50 baseline — the full catalog summing to the 500 budget. */
const baselineAttributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 50]));

describe("UpdateMyPlayerBody affinity vocabulary", () => {
  it("accepts modality-scoped position keys", () => {
    expect(
      UpdateMyPlayerBody.safeParse({ affinity: { campo_atacante: 100, futsal_pivo: 75 } }).success,
    ).toBe(true);
  });

  it("rejects legacy generic position keys", () => {
    expect(UpdateMyPlayerBody.safeParse({ affinity: { atacante: 100 } }).success).toBe(false);
  });
});

describe("UpdateMyPlayerBody", () => {
  it("accepts an empty body (all fields optional)", () => {
    expect(UpdateMyPlayerBody.safeParse({}).success).toBe(true);
  });

  it("accepts a redistributed budget that still sums to 500", () => {
    const attrs = { ...baselineAttributes, chute: 100, passe: 0 };
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(true);
  });

  it("rejects a budget that does not sum to 500", () => {
    const attrs = { ...baselineAttributes, chute: 100 }; // sum 550
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(false);
  });

  it("rejects an incomplete catalog", () => {
    const { chute, ...missingOne } = baselineAttributes;
    void chute;
    expect(UpdateMyPlayerBody.safeParse({ attributes: missingOne }).success).toBe(false);
  });

  it("rejects an attribute value above 100", () => {
    const attrs = { ...baselineAttributes, chute: 120, passe: 50 - 70 };
    expect(UpdateMyPlayerBody.safeParse({ attributes: attrs }).success).toBe(false);
  });

  it("accepts up to 3 distinct skills", () => {
    const parsed = UpdateMyPlayerBody.safeParse({ skills: ["driblador", "goleador", "capitao"] });
    expect(parsed.success).toBe(true);
  });

  it("rejects more than 3 skills", () => {
    const parsed = UpdateMyPlayerBody.safeParse({
      skills: ["driblador", "goleador", "capitao", "maestro"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate skills", () => {
    const parsed = UpdateMyPlayerBody.safeParse({ skills: ["driblador", "driblador"] });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown skill", () => {
    const parsed = UpdateMyPlayerBody.safeParse({ skills: ["capoeirista"] });
    expect(parsed.success).toBe(false);
  });
});
