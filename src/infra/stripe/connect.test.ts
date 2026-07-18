import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";

// Mutable knobs shared with the hoisted module mocks.
const h = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountsRetrieve: vi.fn(),
  accountLinksCreate: vi.fn(),
  paymentIntentsCreate: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: { PLATFORM_FEE_BPS: 500, PLATFORM_FEE_MIN_CENTS: 200 },
}));

vi.mock("@/infra/stripe/client", () => ({
  stripe: () => ({
    accounts: { create: h.accountsCreate, retrieve: h.accountsRetrieve },
    accountLinks: { create: h.accountLinksCreate },
    paymentIntents: { create: h.paymentIntentsCreate },
  }),
}));

// Imported after the mocks are declared (vi.mock is hoisted above imports).
const {
  platformFeeCents,
  createConnectedAccount,
  createAccountLink,
  retrieveAccountStatus,
  createBookingPaymentIntent,
} = await import("./connect");

function makeAuthRepo(): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
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
  h.accountsCreate.mockReset();
  h.accountsRetrieve.mockReset();
  h.accountLinksCreate.mockReset();
  h.paymentIntentsCreate.mockReset();
});

describe("platformFeeCents", () => {
  it("charges the bps rate when it exceeds the floor", () => {
    expect(platformFeeCents(10000)).toBe(500);
  });

  it("floors to PLATFORM_FEE_MIN_CENTS when the bps rate is below it", () => {
    expect(platformFeeCents(1000)).toBe(200);
  });

  it("floors to PLATFORM_FEE_MIN_CENTS for a zero price", () => {
    expect(platformFeeCents(0)).toBe(200);
  });
});

describe("createConnectedAccount", () => {
  it("creates an Express BR account with transfers+pix capabilities and persists the id", async () => {
    h.accountsCreate.mockResolvedValue({ id: "acct_123" });
    const authRepo = makeAuthRepo();

    const id = await createConnectedAccount(authRepo, { id: "u1" });

    expect(id).toBe("acct_123");
    expect(h.accountsCreate).toHaveBeenCalledWith({
      type: "express",
      country: "BR",
      capabilities: {
        transfers: { requested: true },
        pix_payments: { requested: true },
      },
      metadata: { userId: "u1" },
    });
    expect(authRepo.setStripeAccountId).toHaveBeenCalledWith("u1", "acct_123");
  });
});

describe("createAccountLink", () => {
  it("creates an account_onboarding link and returns its url", async () => {
    h.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup/xyz" });

    const url = await createAccountLink("acct_123", {
      refreshUrl: "https://app.example.com/refresh",
      returnUrl: "https://app.example.com/return",
    });

    expect(url).toBe("https://connect.stripe.com/setup/xyz");
    expect(h.accountLinksCreate).toHaveBeenCalledWith({
      account: "acct_123",
      refresh_url: "https://app.example.com/refresh",
      return_url: "https://app.example.com/return",
      type: "account_onboarding",
    });
  });
});

describe("retrieveAccountStatus", () => {
  it("maps charges/payouts/details/requirements from the Stripe account", async () => {
    h.accountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      requirements: { currently_due: ["individual.verification.document"] },
    });

    const status = await retrieveAccountStatus("acct_123");

    expect(h.accountsRetrieve).toHaveBeenCalledWith("acct_123");
    expect(status).toEqual({
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsDue: ["individual.verification.document"],
    });
  });

  it("defaults requirementsDue to [] when requirements/currently_due is missing", async () => {
    h.accountsRetrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: null,
    });

    const status = await retrieveAccountStatus("acct_123");

    expect(status.requirementsDue).toEqual([]);
  });
});

describe("createBookingPaymentIntent", () => {
  it("creates+confirms a destination-charge PIX PaymentIntent server-side with the platform fee on amountCents", async () => {
    h.paymentIntentsCreate.mockResolvedValue({
      id: "pi_123",
      client_secret: "pi_123_secret_abc",
      next_action: {
        pix_display_qr_code: {
          image_url_png: "https://stripe.com/qr.png",
          data: "00020126...emv...6304ABCD",
          expires_at: 1_700_000_000,
        },
      },
    });

    const result = await createBookingPaymentIntent({
      amountCents: 10000,
      destinationAccountId: "acct_123",
      bookingId: "bkg_1",
      customerId: "cus_1",
    });

    expect(result).toEqual({
      id: "pi_123",
      clientSecret: "pi_123_secret_abc",
      pix: {
        qrCodeImageUrl: "https://stripe.com/qr.png",
        copyPaste: "00020126...emv...6304ABCD",
        expiresAt: new Date(1_700_000_000 * 1000).toISOString(),
      },
    });
    expect(h.paymentIntentsCreate).toHaveBeenCalledWith({
      amount: 10000,
      currency: "brl",
      customer: "cus_1",
      payment_method_data: { type: "pix" },
      payment_method_options: { pix: { expires_after_seconds: 1800 } },
      confirm: true,
      transfer_data: { destination: "acct_123" },
      application_fee_amount: 500,
      metadata: { bookingId: "bkg_1" },
    });
  });

  it("computes the application fee over amountCents (the deposit), not a separate full price", async () => {
    h.paymentIntentsCreate.mockResolvedValue({ id: "pi_2", client_secret: "sec" });

    await createBookingPaymentIntent({
      amountCents: 1000,
      destinationAccountId: "acct_123",
      bookingId: "bkg_2",
      customerId: "cus_1",
    });

    expect(h.paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ application_fee_amount: 200, confirm: true }),
    );
  });

  it("returns pix: null when next_action/pix_display_qr_code is absent", async () => {
    h.paymentIntentsCreate.mockResolvedValue({ id: "pi_3", client_secret: "sec_3" });

    const result = await createBookingPaymentIntent({
      amountCents: 5000,
      destinationAccountId: "acct_123",
      bookingId: "bkg_3",
      customerId: "cus_1",
    });

    expect(result.pix).toBeNull();
  });

  it("throws if Stripe returns no client_secret", async () => {
    h.paymentIntentsCreate.mockResolvedValue({ id: "pi_4", client_secret: null });

    await expect(
      createBookingPaymentIntent({
        amountCents: 5000,
        destinationAccountId: "acct_123",
        bookingId: "bkg_4",
        customerId: "cus_1",
      }),
    ).rejects.toThrow();
  });
});
