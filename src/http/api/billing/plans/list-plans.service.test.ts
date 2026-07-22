import { describe, expect, it } from "vitest";
import { createBillingPlansService } from "./list-plans.service";

describe("createBillingPlansService", () => {
  it("monta o preço do catálogo (amountCents/currency/interval) por plano", async () => {
    const plans = await createBillingPlansService().list();
    const org = plans.find((p) => p.key === "organizer");
    expect(org?.price).toEqual({ amountCents: 1990, currency: "brl", interval: "month" });
    expect(org?.includes).toBe("player");
    expect(org?.features).toContain("advanced_stats");

    const player = plans.find((p) => p.key === "player");
    expect(player?.price).toEqual({ amountCents: 990, currency: "brl", interval: "month" });
    expect(player?.includes).toBeNull();
  });

  it("billing-off ainda lista os 2 planos com preço do catálogo (não depende do Stripe)", async () => {
    const plans = await createBillingPlansService().list();
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.price.amountCents > 0)).toBe(true);
  });
});
