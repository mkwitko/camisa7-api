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

  it("all feature keys are offered across the plans", () => {
    const all = [...PLANS.organizer.features, ...PLANS.player.features];
    expect(new Set(all)).toEqual(new Set(FEATURE_KEYS));
  });

  it("each plan points at a Stripe price env var", () => {
    expect(PLANS.organizer.priceEnv).toBe("STRIPE_PRICE_ORGANIZER");
    expect(PLANS.player.priceEnv).toBe("STRIPE_PRICE_PLAYER");
  });

  it("each plan carries a Woovi PIX Automático monthly priceCents + dayGenerateCharge", () => {
    expect(PLANS.organizer.priceCents).toBe(1990);
    expect(PLANS.organizer.dayGenerateCharge).toBe(5);
    expect(PLANS.player.priceCents).toBe(990);
    expect(PLANS.player.dayGenerateCharge).toBe(5);
  });
});

describe("PLANS superset", () => {
  it("organizer engloba todas as features do player", () => {
    for (const f of PLANS.player.features) {
      expect(PLANS.organizer.features).toContain(f);
    }
  });

  it("organizer mantém as próprias features de organizador", () => {
    expect(PLANS.organizer.features).toEqual(
      expect.arrayContaining(["public_groups", "organizer_ai", "seasons"]),
    );
  });

  it("organizer marca includes=player; player não inclui ninguém", () => {
    expect(PLANS.organizer.includes).toBe("player");
    expect((PLANS.player as { includes?: string }).includes).toBeUndefined();
  });

  it("player.features é exatamente [advanced_stats, cosmetics]", () => {
    expect([...PLANS.player.features]).toEqual(["advanced_stats", "cosmetics"]);
  });
});
