import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  billingConfigured: true,
  priceOrganizer: "price_org" as string | undefined,
  pricePlayer: "price_ply" as string | undefined,
  retrieve: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  get env() {
    return { STRIPE_PRICE_ORGANIZER: h.priceOrganizer, STRIPE_PRICE_PLAYER: h.pricePlayer };
  },
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return h.billingConfigured;
  },
  stripe: () => ({ prices: { retrieve: h.retrieve } }),
}));

const { createBillingPlansService } = await import("./list-plans.service");

beforeEach(() => {
  h.billingConfigured = true;
  h.priceOrganizer = "price_org";
  h.pricePlayer = "price_ply";
  h.retrieve.mockReset();
});

describe("createBillingPlansService", () => {
  it("resolve preço do Stripe (amountCents/currency/interval) por plano", async () => {
    h.retrieve.mockImplementation(async (id: string) =>
      id === "price_org"
        ? { unit_amount: 1990, currency: "brl", recurring: { interval: "month" } }
        : { unit_amount: 990, currency: "brl", recurring: { interval: "month" } },
    );
    const plans = await createBillingPlansService().list();
    const org = plans.find((p) => p.key === "organizer");
    expect(org?.price).toEqual({ amountCents: 1990, currency: "brl", interval: "month" });
    expect(org?.includes).toBe("player");
    expect(org?.features).toContain("advanced_stats");
    expect(plans.find((p) => p.key === "player")?.price?.amountCents).toBe(990);
  });

  it("billing off ⇒ price null em todos os planos, ainda lista", async () => {
    h.billingConfigured = false;
    const plans = await createBillingPlansService().list();
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.price === null)).toBe(true);
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it("price env ausente ⇒ price null só naquele plano", async () => {
    h.pricePlayer = undefined;
    h.retrieve.mockResolvedValue({ unit_amount: 1990, currency: "brl", recurring: { interval: "month" } });
    const plans = await createBillingPlansService().list();
    expect(plans.find((p) => p.key === "player")?.price).toBeNull();
    expect(plans.find((p) => p.key === "organizer")?.price?.amountCents).toBe(1990);
  });

  it("retrieve falha ⇒ price null naquele plano, não derruba a lista", async () => {
    h.retrieve.mockImplementation(async (id: string) => {
      if (id === "price_org") throw new Error("no such price");
      return { unit_amount: 990, currency: "brl", recurring: { interval: "month" } };
    });
    const plans = await createBillingPlansService().list();
    expect(plans.find((p) => p.key === "organizer")?.price).toBeNull();
    expect(plans.find((p) => p.key === "player")?.price?.amountCents).toBe(990);
  });

  it("cacheia: 2ª chamada dentro do TTL não rebate no Stripe", async () => {
    h.retrieve.mockResolvedValue({ unit_amount: 1990, currency: "brl", recurring: { interval: "month" } });
    const svc = createBillingPlansService();
    await svc.list();
    await svc.list();
    expect(h.retrieve).toHaveBeenCalledTimes(2); // 2 planos numa rodada só, não 4
  });

  it("não envenena o cache: falha transitória do retrieve é re-tentada na próxima chamada", async () => {
    let calls = 0;
    h.retrieve.mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("blip");
      return { unit_amount: 1990, currency: "brl", recurring: { interval: "month" } };
    });
    const svc = createBillingPlansService();
    const first = await svc.list();
    expect(first.some((p) => p.price === null)).toBe(true); // 1 plano falhou nessa rodada
    const second = await svc.list();
    expect(second.every((p) => p.price !== null)).toBe(true); // re-tentou (não cacheou o erro)
    expect(h.retrieve).toHaveBeenCalledTimes(4);
  });
});
