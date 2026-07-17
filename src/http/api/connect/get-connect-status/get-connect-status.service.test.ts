import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { User } from "@/http/api/auth/auth.types";

const h = vi.hoisted(() => ({
  billingConfigured: true,
  retrieveAccountStatus: vi.fn(),
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return h.billingConfigured;
  },
}));

vi.mock("@/infra/stripe/connect", () => ({
  retrieveAccountStatus: h.retrieveAccountStatus,
}));

// Imported after the mocks are declared (vi.mock is hoisted above imports).
const { createGetConnectStatusService } = await import("./get-connect-status.service");

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "q@b.com",
  name: "Quadra Owner",
  roles: ["quadra"],
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
  h.billingConfigured = true;
  h.retrieveAccountStatus.mockReset();
});

describe("createGetConnectStatusService", () => {
  it("rejects with CON-T0001 when billing isn't configured", async () => {
    h.billingConfigured = false;
    const service = createGetConnectStatusService({ authRepo: makeAuthRepo(aUser()) });

    await expect(service("u1")).rejects.toMatchObject({ code: "CON-T0001" });
  });

  it("rejects with AUTH-T0004 when the user behind the token no longer exists", async () => {
    const service = createGetConnectStatusService({ authRepo: makeAuthRepo(null) });

    await expect(service("u1")).rejects.toMatchObject({ code: "AUTH-T0004" });
  });

  it("returns hasAccount:false without calling Stripe when onboarding never started", async () => {
    const service = createGetConnectStatusService({
      authRepo: makeAuthRepo(aUser({ stripeAccountId: null })),
    });

    const result = await service("u1");

    expect(result).toEqual({
      hasAccount: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
    });
    expect(h.retrieveAccountStatus).not.toHaveBeenCalled();
  });

  it("returns the live status with hasAccount:true when an account exists", async () => {
    h.retrieveAccountStatus.mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsDue: ["individual.verification.document"],
    });
    const service = createGetConnectStatusService({
      authRepo: makeAuthRepo(aUser({ stripeAccountId: "acct_1" })),
    });

    const result = await service("u1");

    expect(h.retrieveAccountStatus).toHaveBeenCalledWith("acct_1");
    expect(result).toEqual({
      hasAccount: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsDue: ["individual.verification.document"],
    });
  });
});
