import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Marketplace V2's money flow (`create-booking.service.ts`) calls Stripe
// through `@/infra/stripe/client` (`isBillingConfigured`,
// `getOrCreateCustomer`) and `@/infra/stripe/connect`
// (`retrieveAccountStatus`, `createBookingPaymentIntent`). Mocked at the
// module boundary (same `vi.hoisted` + getter pattern as
// `create-connect-account.service.test.ts`) so these e2e tests never hit
// real Stripe — only the booking DB flow (real Testcontainers Postgres) is
// under test here. Named `mocks` (not `h`) to avoid colliding with the
// `TestApp` harness variable every other e2e test calls `h`.
const mocks = vi.hoisted(() => ({
  billingConfigured: true,
  retrieveAccountStatus: vi.fn(),
  createBookingPaymentIntent: vi.fn(),
  getOrCreateCustomer: vi.fn(),
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return mocks.billingConfigured;
  },
  getOrCreateCustomer: mocks.getOrCreateCustomer,
}));

vi.mock("@/infra/stripe/connect", () => ({
  retrieveAccountStatus: mocks.retrieveAccountStatus,
  createBookingPaymentIntent: mocks.createBookingPaymentIntent,
}));

const { buildTestApp } = await import("./helpers/app");
type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

const register = (h: TestApp, email: string, roles?: string[]) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "User", ...(roles ? { roles } : {}) },
  });

async function registerAndGetToken(
  h: TestApp,
  email: string,
  roles?: string[],
): Promise<{ token: string; userId: string }> {
  const res = await register(h, email, roles);
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

const createVenue = (h: TestApp, token: string) =>
  h.app.inject({
    method: "POST",
    url: "/venues",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: "Arena Central",
      latitude: -23.5,
      longitude: -46.6,
      address: "Rua do Futebol, 100",
      city: "São Paulo",
      amenities: ["gramado"],
    },
  });

const createCourt = (
  h: TestApp,
  token: string,
  venueId: string,
  body: Record<string, unknown> = {},
) =>
  h.app.inject({
    method: "POST",
    url: `/venues/${venueId}/courts`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Quadra 1", modality: "futsal", ...body },
  });

const setPriceRules = (
  h: TestApp,
  token: string,
  courtId: string,
  rules: Array<{ weekday: number; startMinute: number; endMinute: number; priceCents: number }>,
) =>
  h.app.inject({
    method: "PUT",
    url: `/courts/${courtId}/price-rules`,
    headers: { authorization: `Bearer ${token}` },
    payload: { rules },
  });

const bookSlot = (
  h: TestApp,
  token: string,
  body: { courtId: string; date: string; startMinute: number; endMinute: number },
) =>
  h.app.inject({
    method: "POST",
    url: "/bookings",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const getAvailability = (h: TestApp, token: string, courtId: string, date: string) =>
  h.app.inject({
    method: "GET",
    url: `/courts/${courtId}/availability?date=${date}`,
    headers: { authorization: `Bearer ${token}` },
  });

/** 2026-07-20 is a Monday (`getUTCDay() === 1`). */
const MONDAY = "2026-07-20";
const MONDAY_WEEKDAY = 1;

/**
 * Owner + court fully set up for a booking: venue → court (given
 * `bookingMode`) → price rules for `MONDAY_WEEKDAY` (0-1440, 10000
 * cents/slot) → `stripeAccountId` set directly on the `User` row (bypasses
 * `POST /connect/account`, which would hit the unmocked
 * `createConnectedAccount`).
 */
async function setUpBookableCourt(
  h: TestApp,
  ownerEmail: string,
  bookingMode: "instant" | "request" | "deposit",
  extra: Record<string, unknown> = {},
): Promise<{ ownerToken: string; ownerId: string; courtId: string }> {
  const { token: ownerToken, userId: ownerId } = await registerAndGetToken(h, ownerEmail, [
    "quadra",
  ]);
  const venueRes = await createVenue(h, ownerToken);
  const courtRes = await createCourt(h, ownerToken, venueRes.json().id as string, {
    bookingMode,
    ...extra,
  });
  const courtId = courtRes.json().id as string;
  await setPriceRules(h, ownerToken, courtId, [
    { weekday: MONDAY_WEEKDAY, startMinute: 0, endMinute: 1440, priceCents: 10000 },
  ]);
  await h.prisma.user.update({ where: { id: ownerId }, data: { stripeAccountId: "acct_test" } });
  return { ownerToken, ownerId, courtId };
}

describe("bookings e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Match", "Venue", "User" CASCADE');
    mocks.billingConfigured = true;
    mocks.retrieveAccountStatus.mockReset().mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: [],
    });
    mocks.createBookingPaymentIntent
      .mockReset()
      .mockResolvedValue({ id: "pi_test", clientSecret: "pi_test_secret" });
    mocks.getOrCreateCustomer.mockReset().mockResolvedValue("cus_test");
  });

  describe("GET /courts/:id/availability", () => {
    it("returns the price-rule grid, marking a booked slot unavailable", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-avail@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-avail@x.com");
      await bookSlot(h, bookerToken, { courtId, date: MONDAY, startMinute: 600, endMinute: 660 });

      const res = await getAvailability(h, bookerToken, courtId, MONDAY);

      expect(res.statusCode).toBe(200);
      const slots = res.json() as Array<{ startMinute: number; available: boolean }>;
      expect(slots).toHaveLength(24);
      expect(slots.find((s) => s.startMinute === 600)).toMatchObject({ available: false });
      expect(slots.filter((s) => s.available)).toHaveLength(23);
    });

    it("rejects with 404 CRT-T0001 for an unknown court", async () => {
      const { token } = await registerAndGetToken(h, "someone-avail@x.com");

      const res = await getAvailability(
        h,
        token,
        "00000000-0000-0000-0000-000000000000",
        MONDAY,
      );

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("CRT-T0001");
    });
  });

  describe("POST /bookings", () => {
    it("instant mode: creates a pending_payment booking with a PaymentIntent", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-instant@x.com", "instant");
      const { token: bookerToken, userId: bookerId } = await registerAndGetToken(
        h,
        "booker-instant@x.com",
      );

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as {
        booking: Record<string, unknown>;
        payment?: { paymentIntentId: string; clientSecret: string };
      };
      expect(body.booking).toMatchObject({
        courtId,
        bookedById: bookerId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
        priceCents: 10000,
        mode: "instant",
        status: "pending_payment",
        depositCents: null,
      });
      expect(body.payment).toEqual({ paymentIntentId: "pi_test", clientSecret: "pi_test_secret" });
      expect(mocks.createBookingPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 10000,
          destinationAccountId: "acct_test",
          customerId: "cus_test",
        }),
      );
    });

    it("deposit mode: charges only the deposit percentage", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-deposit@x.com", "deposit", {
        depositPercent: 30,
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-deposit@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { booking: Record<string, unknown> };
      expect(body.booking).toMatchObject({
        priceCents: 10000,
        depositCents: 3000,
        status: "pending_payment",
      });
      expect(mocks.createBookingPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 3000 }),
      );
    });

    it("request mode: creates a requested booking with no PaymentIntent", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-request@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-request@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json() as { booking: Record<string, unknown>; payment?: unknown };
      expect(body.booking).toMatchObject({ mode: "request", status: "requested" });
      expect(body.payment).toBeUndefined();
      expect(mocks.createBookingPaymentIntent).not.toHaveBeenCalled();
    });

    it("rejects with 422 BKG-T0003 for a slot outside any price rule", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-badslot@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-badslot@x.com");

      // Tuesday: no price rule for weekday 2.
      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: "2026-07-21",
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("BKG-T0003");
    });

    it("rejects with 422 BKG-T0003 for a slot misaligned to the slotMinutes grid", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-misaligned@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-misaligned@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 610,
        endMinute: 670,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("BKG-T0003");
    });

    it("rejects with 409 BKG-T0006 when the court is inactive", async () => {
      const { courtId, ownerToken } = await setUpBookableCourt(
        h,
        "owner-inactive@x.com",
        "instant",
      );
      await h.app.inject({
        method: "PATCH",
        url: `/courts/${courtId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { active: false },
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-inactive@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0006");
    });

    it("rejects with 404 CRT-T0001 for an unknown court", async () => {
      const { token: bookerToken } = await registerAndGetToken(h, "booker-nocourt@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId: "00000000-0000-0000-0000-000000000000",
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("CRT-T0001");
    });

    it("rejects with 503 BIL-T0001 when billing isn't configured", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-billingoff@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-billingoff@x.com");
      mocks.billingConfigured = false;

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("BIL-T0001");
      expect(mocks.createBookingPaymentIntent).not.toHaveBeenCalled();
    });

    it("rejects with 409 CON-T0004 when the owner never started Connect onboarding", async () => {
      const { token: ownerToken } = await registerAndGetToken(h, "owner-noconnect@x.com", [
        "quadra",
      ]);
      const venueRes = await createVenue(h, ownerToken);
      const courtRes = await createCourt(h, ownerToken, venueRes.json().id as string, {
        bookingMode: "instant",
      });
      const courtId = courtRes.json().id as string;
      await setPriceRules(h, ownerToken, courtId, [
        { weekday: MONDAY_WEEKDAY, startMinute: 0, endMinute: 1440, priceCents: 10000 },
      ]);
      // deliberately NOT setting `stripeAccountId` on the owner.
      const { token: bookerToken } = await registerAndGetToken(h, "booker-noconnect@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("CON-T0004");
      expect(mocks.createBookingPaymentIntent).not.toHaveBeenCalled();
    });

    it("rejects with 409 CON-T0004 when the owner's account isn't charges_enabled yet", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-notready@x.com", "instant");
      mocks.retrieveAccountStatus.mockResolvedValue({
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsDue: ["individual.verification.document"],
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-notready@x.com");

      const res = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("CON-T0004");
    });

    it("double-book: the second request for the same slot gets 409 BKG-T0002", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-doublebook@x.com", "instant");
      const { token: firstToken } = await registerAndGetToken(h, "booker-doublebook1@x.com");
      const { token: secondToken } = await registerAndGetToken(h, "booker-doublebook2@x.com");
      const slot = { courtId, date: MONDAY, startMinute: 600, endMinute: 660 };

      const first = await bookSlot(h, firstToken, slot);
      const second = await bookSlot(h, secondToken, slot);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(second.json().code).toBe("BKG-T0002");
    });
  });
});
