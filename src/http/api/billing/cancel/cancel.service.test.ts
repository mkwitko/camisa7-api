import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionsRepository } from "../subscription.repository";
import type { Subscription } from "../subscription.types";

const h = vi.hoisted(() => ({
  cancelSubscription: vi.fn(),
}));

vi.mock("@/infra/woovi/client", () => ({
  cancelSubscription: h.cancelSubscription,
}));

const { createCancelSubscriptionService } = await import("./cancel.service");

const USER_ID = "u1";

const aSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "sub1",
  userId: USER_ID,
  plan: "player",
  status: "active",
  wooviCorrelationID: "sub1",
  recurrencyId: "rec1",
  currentPeriodEnd: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function fakeSubscriptionsRepo(
  overrides: Partial<SubscriptionsRepository> = {},
): SubscriptionsRepository {
  return {
    create: vi.fn(),
    findActiveByUser: vi.fn(),
    findByCorrelationId: vi.fn(),
    findLatestByUser: vi.fn().mockResolvedValue(null),
    setStatus: vi.fn().mockImplementation(async (id, status) => aSubscription({ id, status })),
    setActive: vi.fn(),
    extendPeriod: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  h.cancelSubscription.mockReset().mockResolvedValue(undefined);
});

describe("createCancelSubscriptionService", () => {
  it("happy path: cancels the active Subscription on Woovi (by recurrencyId) and marks it canceled", async () => {
    const active = aSubscription({ id: "sub1", status: "active", recurrencyId: "rec1" });
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(active),
    });
    const service = createCancelSubscriptionService({ subscriptionsRepo });

    const result = await service(USER_ID);

    expect(h.cancelSubscription).toHaveBeenCalledWith("rec1");
    expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("sub1", "canceled");
    expect(result).toEqual({ canceled: true });
  });

  it("falls back to wooviCorrelationID when there's no recurrencyId yet (still pending)", async () => {
    const pending = aSubscription({
      id: "sub1",
      status: "pending",
      recurrencyId: null,
      wooviCorrelationID: "sub1",
    });
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(pending),
    });
    const service = createCancelSubscriptionService({ subscriptionsRepo });

    await service(USER_ID);

    expect(h.cancelSubscription).toHaveBeenCalledWith("sub1");
  });

  it("rejects with SUB-T0001 (404) when the user has no Subscription at all", async () => {
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(null),
    });
    const service = createCancelSubscriptionService({ subscriptionsRepo });

    await expect(service(USER_ID)).rejects.toMatchObject({ code: "SUB-T0001", statusCode: 404 });
    expect(h.cancelSubscription).not.toHaveBeenCalled();
  });

  it("rejects with SUB-T0001 (404) when the most recent Subscription is already canceled/expired", async () => {
    const subscriptionsRepo = fakeSubscriptionsRepo({
      findLatestByUser: vi.fn().mockResolvedValue(aSubscription({ status: "expired" })),
    });
    const service = createCancelSubscriptionService({ subscriptionsRepo });

    await expect(service(USER_ID)).rejects.toMatchObject({ code: "SUB-T0001", statusCode: 404 });
    expect(h.cancelSubscription).not.toHaveBeenCalled();
  });
});
