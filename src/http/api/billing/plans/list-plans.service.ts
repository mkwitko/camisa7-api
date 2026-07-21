import { env } from "@/config/env";
import { isBillingConfigured, stripe } from "@/infra/stripe/client";
import { type FeatureKey, type PlanKey, PLANS } from "../billing.catalog";
import type { PlanPriceSchema } from "./billing-plans.schema";

export type PlanPrice = PlanPriceSchema;

export type BillingPlan = {
  key: PlanKey;
  features: FeatureKey[];
  includes: PlanKey | null;
  price: PlanPrice | null;
};

export type BillingPlansService = { list(): Promise<BillingPlan[]> };

/** Preços mudam raramente — um cache curto evita bater no Stripe a cada request. */
const CACHE_TTL_MS = 60_000;

/**
 * Monta os planos vendáveis com preço ao vivo do Stripe. Nunca lança:
 * billing off ⇒ todos os preços `null`; price env ausente ou `prices.retrieve`
 * falhando ⇒ preço `null` só naquele plano (a lista sempre volta completa).
 */
export function createBillingPlansService(): BillingPlansService {
  let cache: { plans: BillingPlan[]; exp: number } | undefined;

  async function resolvePrice(plan: PlanKey): Promise<PlanPrice | null> {
    if (!isBillingConfigured) return null;
    const priceId = env[PLANS[plan].priceEnv];
    if (!priceId) return null;
    try {
      const price = await stripe().prices.retrieve(priceId);
      if (price.unit_amount == null) return null;
      return {
        amountCents: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? "month",
      };
    } catch {
      return null;
    }
  }

  return {
    async list() {
      const now = Date.now();
      if (cache && cache.exp > now) return cache.plans;

      const keys = Object.keys(PLANS) as PlanKey[];
      const plans = await Promise.all(
        keys.map(async (key) => ({
          key,
          features: [...PLANS[key].features],
          includes: (PLANS[key] as { includes?: PlanKey }).includes ?? null,
          price: await resolvePrice(key),
        })),
      );
      cache = { plans, exp: now + CACHE_TTL_MS };
      return plans;
    },
  };
}
