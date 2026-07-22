import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { User } from "@/http/api/auth/auth.types";
import type { SubscriptionsRepository } from "../subscription.repository";
import type { Subscription } from "../subscription.types";

// `isWooviConfigured`/`createSubscription`/`cancelSubscription` are
// module-level exports (not injected deps), so they're mocked at the module
// boundary — same pattern `pay-due.service.test.ts` uses for `createCharge`.
const h = vi.hoisted(() => ({
  wooviConfigured: true,
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("@/infra/woovi/client", () => ({
  get isWooviConfigured() {
    return h.wooviConfigured;
  },
  createSubscription: h.createSubscription,
  cancelSubscription: h.cancelSubscription,
}));

const { createSubscribeService } = await import("./subscribe.service");

const USER_ID = "u1";

const aUser = (overrides: Partial<User> = {}): User => ({
  id: USER_ID,
  email: "player@example.com",
  name: "Player One",
  roles: ["jogador"],
  hasPassword: true,
  googleSub: null,
  lastCity: null,
  lastLat: null,
  lastLng: null,
  stripeCustomerId: null,
  stripeAccountId: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "sub1",
  userId: USER_ID,
  plan: "player",
  status: "pending",
  wooviCorrelationID: "sub1",
  recurrencyId: null,
  currentPeriodEnd: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function fakeAuthRepo(user: User | null): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(user),
    findByGoogleSub: vi.fn(),
    insert: vi.fn(),
    linkGoogle: vi.fn(),
    setRoles: vi.fn(),
    setPushToken: vi.fn(),
    getPushToken: vi.fn(),
    setLocation: vi.fn(),
    setStripeCustomerId: vi.fn(),
    setStripeAccountId: vi.fn(),
    setBillingIdentity: vi.fn(),
  };
}

function fakeSubscriptionsRepo(
  overrides: Partial<SubscriptionsRepository> = {},
): SubscriptionsRepository {
  return {
    create: vi
      .fn()
      .mockResolvedValue(aSubscription({ id: "new-sub", wooviCorrelationID: "new-sub" })),
    findActiveByUser: vi.fn(),
    findByCorrelationId: vi.fn(),
    findLatestByUser: vi.fn().mockResolvedValue(null),
    setStatus: vi.fn().mockImplementation(async (id, status) => aSubscription({ id, status })),
    setActive: vi.fn(),
    extendPeriod: vi.fn(),
    ...overrides,
  };
}

type Deps = Parameters<typeof createSubscribeService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    authRepo: fakeAuthRepo(aUser()),
    subscriptionsRepo: fakeSubscriptionsRepo(),
    ...over,
  };
}

beforeEach(() => {
  h.wooviConfigured = true;
  h.createSubscription.mockReset().mockResolvedValue({
    emv: "00020126...emv",
    recurrencyId: "rec-123",
    globalID: "glob-123",
  });
  h.cancelSubscription.mockReset().mockResolvedValue(undefined);
});

describe("createSubscribeService", () => {
  it("happy path: persists billing identity, creates a Subscription, calls createSubscription and returns pending + emv", async () => {
    const subscriptionsRepo = fakeSubscriptionsRepo();
    const authRepo = fakeAuthRepo(aUser());
    const service = createSubscribeService(buildDeps({ authRepo, subscriptionsRepo }));

    const result = await service(USER_ID, {
      plan: "organizer",
      taxId: "123.456.789-09",
      phone: "+5511999999999",
    });

    expect(authRepo.setBillingIdentity).toHaveBeenCalledWith(USER_ID, {
      taxId: "12345678909",
      phone: "+5511999999999",
    });
    expect(subscriptionsRepo.create).toHaveBeenCalledWith({ userId: USER_ID, plan: "organizer" });
    expect(h.createSubscription).toHaveBeenCalledWith({
      correlationID: "new-sub",
      value: 1990,
      customer: {
        name: "Player One",
        taxID: "12345678909",
        email: "player@example.com",
        phone: "+5511999999999",
      },
      dayGenerateCharge: 5,
    });
    // recurrencyId came back on create ⇒ persisted right away, status stays pending.
    expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("new-sub", "pending", {
      recurrencyId: "rec-123",
    });
    expect(result).toEqual({ subscriptionId: "new-sub", status: "pending", emv: "00020126...emv" });
  });

  it("rejects with SUB-T0002 (400) when the CPF isn't 11 digits after stripping non-digits", async () => {
    const service = createSubscribeService(buildDeps());

    await expect(
      service(USER_ID, { plan: "player", taxId: "123.456", phone: "+5511999999999" }),
    ).rejects.toMatchObject({ code: "SUB-T0002", statusCode: 400 });
    expect(h.createSubscription).not.toHaveBeenCalled();
  });

  it("rejects with WOO-T0001 (503) when Woovi isn't configured", async () => {
    h.wooviConfigured = false;
    const service = createSubscribeService(buildDeps());

    await expect(
      service(USER_ID, { plan: "player", taxId: "12345678909", phone: "+5511999999999" }),
    ).rejects.toMatchObject({ code: "WOO-T0001", statusCode: 503 });
    expect(h.createSubscription).not.toHaveBeenCalled();
  });

  it("cancels a previous active/pending Subscription on Woovi and marks it canceled before creating the new one", async () => {
    const previous = aSubscription({
      id: "prev-sub",
      wooviCorrelationID: "prev-sub",
      status: "active",
      recurrencyId: "rec-old",
    });
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(previous),
    });
    const service = createSubscribeService(buildDeps({ subscriptionsRepo }));

    await service(USER_ID, { plan: "player", taxId: "12345678909", phone: "+5511999999999" });

    expect(h.cancelSubscription).toHaveBeenCalledWith("rec-old");
    expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("prev-sub", "canceled");
    expect(subscriptionsRepo.create).toHaveBeenCalledWith({ userId: USER_ID, plan: "player" });
  });

  it("does not cancel a previous Subscription that's already canceled/expired", async () => {
    const previous = aSubscription({ id: "prev-sub", status: "canceled" });
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(previous),
    });
    const service = createSubscribeService(buildDeps({ subscriptionsRepo }));

    await service(USER_ID, { plan: "player", taxId: "12345678909", phone: "+5511999999999" });

    expect(h.cancelSubscription).not.toHaveBeenCalled();
    expect(subscriptionsRepo.setStatus).not.toHaveBeenCalledWith("prev-sub", "canceled");
  });

  it("marks the just-created Subscription canceled and rethrows when createSubscription (Woovi) fails", async () => {
    const wooviError = new Error("Woovi is down");
    h.createSubscription.mockReset().mockRejectedValue(wooviError);
    const subscriptionsRepo = fakeSubscriptionsRepo();
    const service = createSubscribeService(buildDeps({ subscriptionsRepo }));

    await expect(
      service(USER_ID, { plan: "player", taxId: "12345678909", phone: "+5511999999999" }),
    ).rejects.toThrow(wooviError);

    expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("new-sub", "canceled");
  });
});
