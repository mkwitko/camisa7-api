import { type FeatureKey, PLANS, type PlanKey } from "../billing.catalog";
import type { PlanPriceSchema } from "./billing-plans.schema";

export type PlanPrice = PlanPriceSchema;

export type BillingPlan = {
  key: PlanKey;
  features: FeatureKey[];
  includes: PlanKey | null;
  price: PlanPrice;
};

export type BillingPlansService = { list(): Promise<BillingPlan[]> };

/**
 * Monta os planos vendáveis com preço do catálogo (Woovi Fase 3): não resolve
 * mais ao vivo do Stripe (`prices.retrieve`) — `PLANS[key].priceCents` é
 * fixo, mensal, BRL, cobrado via PIX Automático. Preço nunca é `null` aqui
 * (todo plano do catálogo tem `priceCents`), billing ligado ou não — sem
 * cache, sem chamada de rede, é leitura pura de constante.
 */
export function createBillingPlansService(): BillingPlansService {
  function priceOf(key: PlanKey): PlanPrice {
    return { amountCents: PLANS[key].priceCents, currency: "brl", interval: "month" };
  }

  return {
    async list() {
      const keys = Object.keys(PLANS) as PlanKey[];
      return keys.map((key) => ({
        key,
        features: [...PLANS[key].features],
        includes: (PLANS[key] as { includes?: PlanKey }).includes ?? null,
        price: priceOf(key),
      }));
    },
  };
}
