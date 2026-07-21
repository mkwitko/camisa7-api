import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../auth/auth.repository";
import type { User } from "../auth/auth.types";
import { FEATURE_KEYS } from "./billing.catalog";

// Mutable knobs shared with the hoisted module mocks.
const h = vi.hoisted(() => ({
  reviewerEmails: "",
  billingConfigured: true,
  unlockAll: false,
  list: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  get env() {
    return { REVIEWER_EMAILS: h.reviewerEmails, ENTITLEMENTS_UNLOCK_ALL: h.unlockAll };
  },
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return h.billingConfigured;
  },
  stripe: () => ({
    entitlements: { activeEntitlements: { list: h.list } },
  }),
  getOrCreateCustomer: vi.fn(),
}));

// Imported after the mocks are declared (vi.mock is hoisted above imports).
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

beforeEach(() => {
  h.reviewerEmails = "";
  h.billingConfigured = true;
  h.unlockAll = false;
  h.list.mockReset();
});

describe("createEntitlementsService", () => {
  it("reviewer email gets ALL features and payments disabled, without calling Stripe", async () => {
    h.reviewerEmails = "stores@test.com, other@test.com";
    const svc = createEntitlementsService({
      authRepo: makeAuthRepo(aUser({ email: "stores@test.com" })),
    });

    const features = await svc.activeFeatures("u1");
    expect(features).toEqual(new Set(FEATURE_KEYS));
    expect(await svc.hasFeature("u1", "public_groups")).toBe(true);
    expect(await svc.hasFeature("u1", "cosmetics")).toBe(true);
    expect(await svc.paymentsEnabled("u1")).toBe(false);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("ENTITLEMENTS_UNLOCK_ALL grants ALL features to any user, without Stripe (test/dev)", async () => {
    h.unlockAll = true;
    h.billingConfigured = false; // sem Stripe: mesmo assim libera tudo
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(aUser()) });

    expect(await svc.activeFeatures("u1")).toEqual(new Set(FEATURE_KEYS));
    expect(h.list).not.toHaveBeenCalled();
  });

  it("billing off (not configured) yields no features but payments enabled for non-reviewers", async () => {
    h.billingConfigured = false;
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(aUser()) });

    expect(await svc.activeFeatures("u1")).toEqual(new Set());
    expect(await svc.hasFeature("u1", "public_groups")).toBe(false);
    expect(await svc.paymentsEnabled("u1")).toBe(true);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("configured + no customer yet yields no features (no Stripe call, no customer creation)", async () => {
    const svc = createEntitlementsService({
      authRepo: makeAuthRepo(aUser({ stripeCustomerId: null })),
    });
    expect(await svc.activeFeatures("u1")).toEqual(new Set());
    expect(h.list).not.toHaveBeenCalled();
  });

  it("resolves lookup_keys from Stripe for a customer and caches within TTL", async () => {
    h.list.mockResolvedValue({
      data: [{ lookup_key: "public_groups" }, { lookup_key: "seasons" }],
    });
    const svc = createEntitlementsService({
      authRepo: makeAuthRepo(aUser({ stripeCustomerId: "cus_123" })),
    });

    expect(await svc.activeFeatures("u1")).toEqual(new Set(["public_groups", "seasons"]));
    // Second call served from cache — Stripe hit only once.
    await svc.activeFeatures("u1");
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it("invalidate drops the cached entitlements for a customer", async () => {
    h.list.mockResolvedValue({ data: [{ lookup_key: "cosmetics" }] });
    const svc = createEntitlementsService({
      authRepo: makeAuthRepo(aUser({ stripeCustomerId: "cus_123" })),
    });

    await svc.activeFeatures("u1");
    svc.invalidate("cus_123");
    await svc.activeFeatures("u1");
    expect(h.list).toHaveBeenCalledTimes(2);
  });

  it("unknown user yields no features and payments enabled", async () => {
    const svc = createEntitlementsService({ authRepo: makeAuthRepo(null) });
    expect(await svc.activeFeatures("nope")).toEqual(new Set());
    expect(await svc.paymentsEnabled("nope")).toBe(true);
  });
});
