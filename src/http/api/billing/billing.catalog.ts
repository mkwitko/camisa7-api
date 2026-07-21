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
 * Subscription plans (Stripe products with features attached). `priceEnv` names
 * the env var holding the plan's Stripe price id — resolved at checkout time,
 * so a deploy without that price simply can't offer the plan. `features` are
 * the entitlement keys the plan grants (informational/UX; the real grant comes
 * from Stripe once the subscription is active).
 */
export const PLANS = {
  organizer: {
    priceEnv: "STRIPE_PRICE_ORGANIZER",
    // Organizador é o tier superior: engloba as features do Jogador.
    features: ["public_groups", "organizer_ai", "seasons", "advanced_stats", "cosmetics"],
    includes: "player",
  },
  player: {
    priceEnv: "STRIPE_PRICE_PLAYER",
    features: ["advanced_stats", "cosmetics"],
  },
} as const satisfies Record<
  string,
  { priceEnv: keyof EnvConfig; features: readonly FeatureKey[]; includes?: string }
>;

export type PlanKey = keyof typeof PLANS;
