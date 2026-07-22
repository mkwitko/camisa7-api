import type { EnvConfig } from "@/config/env";

/**
 * Feature catalog — the single source of truth for entitlement keys, mirroring
 * the `lookup_key` of the features configured in the Stripe dashboard.
 *
 * Stripe is the source of truth for WHO has a feature (via the Entitlements
 * API); this constant is just the closed set of keys the app knows about, so
 * `GET /billing/me` and the reviewer bypass have a canonical list to hand back.
 */
export const FEATURE_KEYS = [
  // Organizer plan
  "public_groups",
  "organizer_ai",
  "seasons",
  // Player plan
  "advanced_stats",
  "cosmetics",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Subscription plans. `priceCents` is the plan's fixed monthly price (BRL,
 * cents) charged via Woovi PIX Automático; `dayGenerateCharge` is the day of
 * the month Woovi generates the recurring charge (`subscriptions.create`'s
 * `dayGenerateCharge`). `priceEnv` (legacy Stripe price env var) is kept
 * alongside it only because `billing-checkout.controller.ts` still reads it —
 * Task 6 (checkout removal) deletes `priceEnv` for good. `features` are the
 * entitlement keys the plan grants; once a Woovi `Subscription` is `active`,
 * `entitlements.service.ts` resolves them from `PLANS[sub.plan].features`.
 */
export const PLANS = {
  organizer: {
    priceEnv: "STRIPE_PRICE_ORGANIZER",
    // Organizador é o tier superior: engloba as features do Jogador.
    features: ["public_groups", "organizer_ai", "seasons", "advanced_stats", "cosmetics"],
    includes: "player",
    priceCents: 1990,
    dayGenerateCharge: 5,
  },
  player: {
    priceEnv: "STRIPE_PRICE_PLAYER",
    features: ["advanced_stats", "cosmetics"],
    priceCents: 990,
    dayGenerateCharge: 5,
  },
} as const satisfies Record<
  string,
  {
    priceEnv: keyof EnvConfig;
    features: readonly FeatureKey[];
    includes?: string;
    priceCents: number;
    dayGenerateCharge: number;
  }
>;

export type PlanKey = keyof typeof PLANS;
