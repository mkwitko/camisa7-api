import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, PLANS } from "./billing.catalog";

describe("billing.catalog", () => {
  it("exposes exactly the five feature keys", () => {
    expect([...FEATURE_KEYS]).toEqual([
      "public_groups",
      "organizer_ai",
      "seasons",
      "advanced_stats",
      "cosmetics",
    ]);
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("every plan feature is a valid feature key", () => {
    const valid = new Set<string>(FEATURE_KEYS);
    for (const plan of Object.values(PLANS)) {
      for (const feature of plan.features) {
        expect(valid.has(feature)).toBe(true);
      }
    }
  });

  it("plans partition the features across organizer and player", () => {
    expect([...PLANS.organizer.features]).toEqual(["public_groups", "organizer_ai", "seasons"]);
    expect([...PLANS.player.features]).toEqual(["advanced_stats", "cosmetics"]);
    const all = [...PLANS.organizer.features, ...PLANS.player.features];
    expect(new Set(all)).toEqual(new Set(FEATURE_KEYS));
  });

  it("each plan points at a Stripe price env var", () => {
    expect(PLANS.organizer.priceEnv).toBe("STRIPE_PRICE_ORGANIZER");
    expect(PLANS.player.priceEnv).toBe("STRIPE_PRICE_PLAYER");
  });
});
