import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { Role, User } from "@/http/api/auth/auth.types";

// Mutable knobs shared with the hoisted module mocks (same pattern as
// `entitlements.service.test.ts`) — `connect.ts`'s helpers are module-level
// functions, not injected deps, so they're mocked at the module boundary.
const h = vi.hoisted(() => ({
  billingConfigured: true,
  createConnectedAccount: vi.fn(),
  createAccountLink: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: { WEB_BASE_URL: "http://localhost:5173" },
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return h.billingConfigured;
  },
}));

vi.mock("@/infra/stripe/connect", () => ({
  createConnectedAccount: h.createConnectedAccount,
  createAccountLink: h.createAccountLink,
}));

// Imported after the mocks are declared (vi.mock is hoisted above imports).
const { createCreateConnectAccountService } = await import("./create-connect-account.service");

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "q@b.com",
  name: "Quadra Owner",
  roles: ["quadra"] as Role[],
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
  h.createConnectedAccount.mockReset().mockResolvedValue("acct_new");
  h.createAccountLink.mockReset().mockResolvedValue("https://connect.stripe.com/setup/acct_new");
});

describe("createCreateConnectAccountService", () => {
  it("rejects with CON-T0001 when billing isn't configured", async () => {
    h.billingConfigured = false;
    const service = createCreateConnectAccountService({ authRepo: makeAuthRepo(aUser()) });

    await expect(service("u1")).rejects.toMatchObject({ code: "CON-T0001" });
    expect(h.createConnectedAccount).not.toHaveBeenCalled();
  });

  it("rejects with AUTH-T0004 when the user behind the token no longer exists", async () => {
    const service = createCreateConnectAccountService({ authRepo: makeAuthRepo(null) });

    await expect(service("u1")).rejects.toMatchObject({ code: "AUTH-T0004" });
  });

  it("rejects with CON-T0002 (soft-gate) when the user lacks the `quadra` role", async () => {
    const service = createCreateConnectAccountService({
      authRepo: makeAuthRepo(aUser({ roles: ["jogador"] })),
    });

    await expect(service("u1")).rejects.toMatchObject({ code: "CON-T0002" });
    expect(h.createConnectedAccount).not.toHaveBeenCalled();
  });

  it("creates a new connected account when the user has none yet", async () => {
    const authRepo = makeAuthRepo(aUser({ stripeAccountId: null }));
    const service = createCreateConnectAccountService({ authRepo });

    const result = await service("u1");

    expect(h.createConnectedAccount).toHaveBeenCalledWith(
      authRepo,
      expect.objectContaining({ id: "u1" }),
    );
    expect(h.createAccountLink).toHaveBeenCalledWith("acct_new", {
      refreshUrl: "http://localhost:5173/quadra/pagamentos?refresh=1",
      returnUrl: "http://localhost:5173/quadra/pagamentos?done=1",
    });
    expect(result).toEqual({ url: "https://connect.stripe.com/setup/acct_new" });
  });

  it("reuses the existing account id instead of creating a new one", async () => {
    const authRepo = makeAuthRepo(aUser({ stripeAccountId: "acct_existing" }));
    const service = createCreateConnectAccountService({ authRepo });

    const result = await service("u1");

    expect(h.createConnectedAccount).not.toHaveBeenCalled();
    expect(h.createAccountLink).toHaveBeenCalledWith("acct_existing", expect.any(Object));
    expect(result).toEqual({ url: "https://connect.stripe.com/setup/acct_new" });
  });
});
