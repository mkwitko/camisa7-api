import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../auth/auth.repository";
import type { User } from "../auth/auth.types";
import { FEATURE_KEYS } from "./billing.catalog";
import type { SubscriptionsRepository } from "./subscription.repository";
import type { Subscription } from "./subscription.types";

// Mutable knobs shared with the hoisted module mock.
const h = vi.hoisted(() => ({
  reviewerEmails: "",
  unlockAll: false,
}));

vi.mock("@/config/env", () => ({
  get env() {
    return { REVIEWER_EMAILS: h.reviewerEmails, ENTITLEMENTS_UNLOCK_ALL: h.unlockAll };
  },
}));

// Imported after the mock is declared (vi.mock is hoisted above imports).
const { createEntitlementsService } = await import("./entitlements.service");

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "player@example.com",
  name: "Player",
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
  userId: "u1",
  plan: "player",
  status: "active",
  wooviCorrelationID: "sub1",
  recurrencyId: "rec1",
  currentPeriodEnd: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function makeAuthRepo(user: User | null): AuthRepository {
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
  };
}

function makeSubscriptionsRepo(active: Subscription | null): SubscriptionsRepository {
  return {
    create: vi.fn(),
    findActiveByUser: vi.fn().mockResolvedValue(active),
    findByCorrelationId: vi.fn(),
    findLatestByUser: vi.fn(),
    setStatus: vi.fn(),
    setActive: vi.fn(),
    extendPeriod: vi.fn(),
  };
}

beforeEach(() => {
  h.reviewerEmails = "";
  h.unlockAll = false;
});

describe("createEntitlementsService", () => {
  it("reviewer email gets ALL features and payments disabled, without hitting the DB", async () => {
    h.reviewerEmails = "stores@test.com, other@test.com";
    const subscriptionsRepo = makeSubscriptionsRepo(null);
    const svc = createEntitlementsService({
      authRepo: makeAuthRepo(aUser({ email: "stores@test.com" })),
      subscriptionsRepo,
    });

    const features = await svc.activeFeatures("u1");
    expect(features).toEqual(new Set(FEATURE_KEYS));
    expect(await svc.hasFeature("u1", "public_groups")).toBe(true);
    expect(await svc.hasFeature("u1", "cosmetics")).toBe(true);
    expect(await svc.paymentsEnabled("u1")).toBe(false);
    expect(subscriptionsRepo.findActiveByUser).not.toHaveBeenCalled();
  });

  it("ENTITLEMENTS_UNLOCK_ALL grants ALL features to any user, without a subscription (test/dev)", async () => {
    h.unlockAll = true;
    const subscriptionsRepo = makeSubscriptionsRepo(null);
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(aUser()), subscriptionsRepo });

    expect(await svc.activeFeatures("u1")).toEqual(new Set(FEATURE_KEYS));
    expect(subscriptionsRepo.findActiveByUser).not.toHaveBeenCalled();
  });

  it("active subscription in the DB yields PLANS[plan].features", async () => {
    const subscriptionsRepo = makeSubscriptionsRepo(aSubscription({ plan: "organizer" }));
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(aUser()), subscriptionsRepo });

    expect(await svc.activeFeatures("u1")).toEqual(
      new Set(["public_groups", "organizer_ai", "seasons", "advanced_stats", "cosmetics"]),
    );
    expect(await svc.hasFeature("u1", "public_groups")).toBe(true);
    expect(await svc.paymentsEnabled("u1")).toBe(true);
  });

  it("no active subscription yields no features (payments enabled for non-reviewers)", async () => {
    const subscriptionsRepo = makeSubscriptionsRepo(null);
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(aUser()), subscriptionsRepo });

    expect(await svc.activeFeatures("u1")).toEqual(new Set());
    expect(await svc.hasFeature("u1", "public_groups")).toBe(false);
    expect(await svc.paymentsEnabled("u1")).toBe(true);
  });

  it("unknown user yields no features and payments enabled, without a DB lookup", async () => {
    const subscriptionsRepo = makeSubscriptionsRepo(null);
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(null), subscriptionsRepo });

    expect(await svc.activeFeatures("nope")).toEqual(new Set());
    expect(await svc.paymentsEnabled("nope")).toBe(true);
    expect(subscriptionsRepo.findActiveByUser).not.toHaveBeenCalled();
  });
});
