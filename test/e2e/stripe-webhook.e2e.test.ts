import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `stripe-webhook.controller.ts` calls Stripe only for signature verification
// (`stripe().webhooks.constructEvent`) and reads `isBillingConfigured`, both
// from `@/infra/stripe/client` — mocked at the module boundary (same
// `vi.hoisted` + getter pattern as `bookings.e2e.test.ts`/
// `create-connect-account.service.test.ts`) so we never fabricate a real
// Stripe signature; `constructEvent` is stubbed to hand back whatever event
// object each test builds. `STRIPE_WEBHOOK_SECRET` is set directly on
// `process.env` (read by the real, unmocked `@/config/env`) before the app's
// dynamic import below — same trick `buildTestApp` itself uses for
// `DATABASE_URL`.
const mocks = vi.hoisted(() => ({
  billingConfigured: true,
  constructEvent: vi.fn(),
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return mocks.billingConfigured;
  },
  stripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const { buildTestApp } = await import("./helpers/app");
const { createBookingRepository } = await import("../../src/http/api/bookings/booking.repository");
const { createOwner } = await import("../builders/group.builder");

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

function stripeEvent(type: string, paymentIntentId: string): Record<string, unknown> {
  return { id: "evt_test", type, data: { object: { id: paymentIntentId } } };
}

const postWebhook = (h: TestApp, payload: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: "/webhooks/stripe",
    headers: { "stripe-signature": "t=1,v1=test" },
    payload,
  });

describe("POST /webhooks/stripe — payment_intent.* (e2e)", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Booking", "Court", "Venue", "User" CASCADE');
    mocks.billingConfigured = true;
    mocks.constructEvent.mockReset();
  });

  async function seedPendingBooking(paymentIntentId: string): Promise<string> {
    const ownerId = await createOwner(h.prisma);
    const bookerId = await createOwner(h.prisma);
    const venue = await h.prisma.venue.create({
      data: {
        ownerId,
        name: "Arena Central",
        latitude: -23.5,
        longitude: -46.6,
        address: "Rua do Futebol, 100",
        city: "São Paulo",
      },
    });
    const court = await h.prisma.court.create({
      data: { venueId: venue.id, name: "Quadra 1" },
    });
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.insert({
      courtId: court.id,
      bookedById: bookerId,
      date: "2026-08-10",
      startMinute: 600,
      endMinute: 660,
      priceCents: 10000,
      mode: "instant",
      status: "pending_payment",
    });
    await bookingRepo.setPaymentIntent(booking.id, paymentIntentId);
    return booking.id;
  }

  it("moves a pending_payment booking to confirmed on payment_intent.succeeded", async () => {
    const bookingId = await seedPendingBooking("pi_succeeded_1");
    mocks.constructEvent.mockReturnValue(stripeEvent("payment_intent.succeeded", "pi_succeeded_1"));

    const res = await postWebhook(h, { any: "payload" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("confirmed");
  });

  it("is idempotent: a repeated payment_intent.succeeded delivery is a no-op, still 200", async () => {
    const bookingId = await seedPendingBooking("pi_succeeded_2");
    mocks.constructEvent.mockReturnValue(stripeEvent("payment_intent.succeeded", "pi_succeeded_2"));

    const first = await postWebhook(h, { any: "payload" });
    const second = await postWebhook(h, { any: "payload" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("confirmed");
  });

  it("moves a pending_payment booking to expired on payment_intent.payment_failed", async () => {
    const bookingId = await seedPendingBooking("pi_failed_1");
    mocks.constructEvent.mockReturnValue(
      stripeEvent("payment_intent.payment_failed", "pi_failed_1"),
    );

    const res = await postWebhook(h, { any: "payload" });

    expect(res.statusCode).toBe(200);
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("expired");
  });

  it("moves a pending_payment booking to expired on payment_intent.canceled", async () => {
    const bookingId = await seedPendingBooking("pi_canceled_1");
    mocks.constructEvent.mockReturnValue(stripeEvent("payment_intent.canceled", "pi_canceled_1"));

    const res = await postWebhook(h, { any: "payload" });

    expect(res.statusCode).toBe(200);
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("expired");
  });

  it("acks 200 and does nothing for an unknown PaymentIntent id", async () => {
    await seedPendingBooking("pi_known");
    mocks.constructEvent.mockReturnValue(stripeEvent("payment_intent.succeeded", "pi_unknown"));

    const res = await postWebhook(h, { any: "payload" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    const bookingRepo = createBookingRepository(h.prisma);
    const booking = await bookingRepo.findByPaymentIntentId("pi_known");
    expect(booking?.status).toBe("pending_payment");
  });

  it("responds 400 when signature verification fails", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await postWebhook(h, { any: "payload" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ received: false });
  });
});
