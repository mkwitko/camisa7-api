import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Marketplace V2's money flow (`create-booking.service.ts`,
// `approve-booking.service.ts`) calls Stripe through `@/infra/stripe/client`
// (`isBillingConfigured`, `getOrCreateCustomer`, `stripe()`) and
// `@/infra/stripe/connect` (`retrieveAccountStatus`,
// `createBookingPaymentIntent`). `cancel-booking.service.ts` also calls
// `stripe().paymentIntents.cancel` (best-effort). Mocked at the module
// boundary (same `vi.hoisted` + getter pattern as
// `create-connect-account.service.test.ts`) so these e2e tests never hit
// real Stripe — only the booking DB flow (real Testcontainers Postgres) is
// under test here. Named `mocks` (not `h`) to avoid colliding with the
// `TestApp` harness variable every other e2e test calls `h`.
const mocks = vi.hoisted(() => ({
  billingConfigured: true,
  retrieveAccountStatus: vi.fn(),
  createBookingPaymentIntent: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  paymentIntentsCancel: vi.fn(),
}));

vi.mock("@/infra/stripe/client", () => ({
  get isBillingConfigured() {
    return mocks.billingConfigured;
  },
  getOrCreateCustomer: mocks.getOrCreateCustomer,
  stripe: () => ({ paymentIntents: { cancel: mocks.paymentIntentsCancel } }),
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

const listMyBookings = (h: TestApp, token: string) =>
  h.app.inject({
    method: "GET",
    url: "/bookings/mine",
    headers: { authorization: `Bearer ${token}` },
  });

const cancelBooking = (h: TestApp, token: string, bookingId: string) =>
  h.app.inject({
    method: "POST",
    url: `/bookings/${bookingId}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });

const listVenueBookings = (h: TestApp, token: string, venueId: string, from: string, to: string) =>
  h.app.inject({
    method: "GET",
    url: `/venues/${venueId}/bookings?from=${from}&to=${to}`,
    headers: { authorization: `Bearer ${token}` },
  });

const approveBooking = (h: TestApp, token: string, bookingId: string) =>
  h.app.inject({
    method: "POST",
    url: `/bookings/${bookingId}/approve`,
    headers: { authorization: `Bearer ${token}` },
  });

const rejectBooking = (h: TestApp, token: string, bookingId: string) =>
  h.app.inject({
    method: "POST",
    url: `/bookings/${bookingId}/reject`,
    headers: { authorization: `Bearer ${token}` },
  });

const completeBooking = (h: TestApp, token: string, bookingId: string) =>
  h.app.inject({
    method: "POST",
    url: `/bookings/${bookingId}/complete`,
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
): Promise<{ ownerToken: string; ownerId: string; venueId: string; courtId: string }> {
  const { token: ownerToken, userId: ownerId } = await registerAndGetToken(h, ownerEmail, [
    "quadra",
  ]);
  const venueRes = await createVenue(h, ownerToken);
  const venueId = venueRes.json().id as string;
  const courtRes = await createCourt(h, ownerToken, venueId, {
    bookingMode,
    ...extra,
  });
  const courtId = courtRes.json().id as string;
  await setPriceRules(h, ownerToken, courtId, [
    { weekday: MONDAY_WEEKDAY, startMinute: 0, endMinute: 1440, priceCents: 10000 },
  ]);
  await h.prisma.user.update({ where: { id: ownerId }, data: { stripeAccountId: "acct_test" } });
  return { ownerToken, ownerId, venueId, courtId };
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
      .mockResolvedValue({ id: "pi_test", clientSecret: "pi_test_secret", pix: null });
    mocks.getOrCreateCustomer.mockReset().mockResolvedValue("cus_test");
    mocks.paymentIntentsCancel.mockReset().mockResolvedValue({ id: "pi_test", status: "canceled" });
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
      expect(body.payment).toEqual({ paymentIntentId: "pi_test", clientSecret: "pi_test_secret", pix: null });
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

  describe("GET /bookings/mine", () => {
    it("returns only the caller's own bookings", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-mine@x.com", "instant");
      const { token: bookerToken, userId: bookerId } = await registerAndGetToken(
        h,
        "booker-mine@x.com",
      );
      const { token: otherToken } = await registerAndGetToken(h, "other-mine@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      expect(bookRes.statusCode).toBe(201);

      const mine = await listMyBookings(h, bookerToken);
      const others = await listMyBookings(h, otherToken);

      expect(mine.statusCode).toBe(200);
      const bookings = mine.json() as Array<Record<string, unknown>>;
      expect(bookings).toHaveLength(1);
      expect(bookings[0]).toMatchObject({ courtId, bookedById: bookerId });
      expect(others.statusCode).toBe(200);
      expect(others.json()).toEqual([]);
    });
  });

  describe("POST /bookings/:id/cancel", () => {
    it("lets the booker cancel a pending_payment booking and best-effort cancels the PaymentIntent", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-cancel1@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-cancel1@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await cancelBooking(h, bookerToken, bookingId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "cancelled" });
      expect(mocks.paymentIntentsCancel).toHaveBeenCalledWith("pi_test");
    });

    it("lets the venue owner cancel a booker's booking", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-cancel2@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-cancel2@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await cancelBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "cancelled" });
    });

    it("rejects a stranger with 403 BKG-T0004", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-cancel3@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-cancel3@x.com");
      const { token: strangerToken } = await registerAndGetToken(h, "stranger-cancel3@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await cancelBooking(h, strangerToken, bookingId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("BKG-T0004");
    });

    it("rejects cancelling an already-cancelled booking with 409 BKG-T0005", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-cancel4@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-cancel4@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      await cancelBooking(h, bookerToken, bookingId);

      const res = await cancelBooking(h, bookerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });

    it("still cancels the booking when the Stripe PaymentIntent cancel fails (best-effort)", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-cancel5@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-cancel5@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      mocks.paymentIntentsCancel.mockRejectedValue(new Error("stripe blew up"));

      const res = await cancelBooking(h, bookerToken, bookingId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "cancelled" });
    });

    it("rejects an unknown booking with 404 BKG-T0001", async () => {
      const { token } = await registerAndGetToken(h, "someone-cancel6@x.com");

      const res = await cancelBooking(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("BKG-T0001");
    });
  });

  describe("GET /venues/:id/bookings", () => {
    it("lists the venue's bookings within the range for the owner", async () => {
      const { ownerToken, venueId, courtId } = await setUpBookableCourt(
        h,
        "owner-agenda1@x.com",
        "instant",
      );
      const { token: bookerToken } = await registerAndGetToken(h, "booker-agenda1@x.com");
      await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      const res = await listVenueBookings(h, ownerToken, venueId, MONDAY, MONDAY);

      expect(res.statusCode).toBe(200);
      const bookings = res.json() as Array<Record<string, unknown>>;
      expect(bookings).toHaveLength(1);
      expect(bookings[0]).toMatchObject({ courtId, date: MONDAY });
    });

    it("excludes bookings outside the requested range", async () => {
      const { ownerToken, venueId, courtId } = await setUpBookableCourt(
        h,
        "owner-agenda2@x.com",
        "instant",
      );
      const { token: bookerToken } = await registerAndGetToken(h, "booker-agenda2@x.com");
      await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });

      const res = await listVenueBookings(h, ownerToken, venueId, "2026-07-21", "2026-07-22");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("rejects a non-owner with 403 VEN-T0003", async () => {
      const { venueId } = await setUpBookableCourt(h, "owner-agenda3@x.com", "instant");
      const { token: strangerToken } = await registerAndGetToken(h, "stranger-agenda3@x.com");

      const res = await listVenueBookings(h, strangerToken, venueId, MONDAY, MONDAY);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VEN-T0003");
    });

    it("rejects an unknown venue with 404 VEN-T0002", async () => {
      const { token } = await registerAndGetToken(h, "someone-agenda4@x.com");

      const res = await listVenueBookings(
        h,
        token,
        "00000000-0000-0000-0000-000000000000",
        MONDAY,
        MONDAY,
      );

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("VEN-T0002");
    });
  });

  describe("POST /bookings/:id/approve", () => {
    it("approves a requested booking, creating a PaymentIntent and moving it to pending_payment", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve1@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve1@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      expect(bookRes.json().booking).toMatchObject({ status: "requested" });
      const bookingId = bookRes.json().booking.id as string;

      const res = await approveBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        booking: Record<string, unknown>;
        payment: { paymentIntentId: string; clientSecret: string };
      };
      expect(body.booking).toMatchObject({ status: "pending_payment", mode: "request" });
      expect(body.payment).toEqual({ paymentIntentId: "pi_test", clientSecret: "pi_test_secret", pix: null });
      expect(mocks.createBookingPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 10000, destinationAccountId: "acct_test" }),
      );
    });

    it("rejects a non-owner (booker or stranger) with 403 BKG-T0004", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-approve2@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve2@x.com");
      const { token: strangerToken } = await registerAndGetToken(h, "stranger-approve2@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const byBooker = await approveBooking(h, bookerToken, bookingId);
      const byStranger = await approveBooking(h, strangerToken, bookingId);

      expect(byBooker.statusCode).toBe(403);
      expect(byBooker.json().code).toBe("BKG-T0004");
      expect(byStranger.statusCode).toBe(403);
      expect(byStranger.json().code).toBe("BKG-T0004");
    });

    it("rejects an instant-mode booking (never requested) with 409 BKG-T0005", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve3@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve3@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await approveBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });

    it("rejects approving a booking that was already rejected with 409 BKG-T0005", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve4@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve4@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      await rejectBooking(h, ownerToken, bookingId);

      const res = await approveBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });

    it("rejects with 503 BIL-T0001 when billing isn't configured", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve5@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve5@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      mocks.billingConfigured = false;

      const res = await approveBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("BIL-T0001");
    });

    it("rejects with 409 CON-T0004 when the owner's account isn't charges_enabled", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve6@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve6@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      mocks.retrieveAccountStatus.mockResolvedValue({
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsDue: ["individual.verification.document"],
      });

      const res = await approveBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("CON-T0004");
    });

    it("rejects an unknown booking with 404 BKG-T0001", async () => {
      const { token } = await registerAndGetToken(h, "someone-approve7@x.com");

      const res = await approveBooking(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("BKG-T0001");
    });

    it("a second approve after a successful claim gets 409 BKG-T0005 and never creates a second PaymentIntent", async () => {
      // Proves the atomic `transitionStatus` claim (`requested` ->
      // `pending_payment`) closes the race from the B7 follow-up finding:
      // two concurrent/retried approves must not both create a live Stripe
      // PaymentIntent for the same booking. A true concurrent race is hard
      // to force in e2e, so this exercises the guard sequentially — by the
      // time the second call's pre-checks run, the booking is no longer
      // `requested`, so it never even reaches the claim.
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-approve8@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-approve8@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const first = await approveBooking(h, ownerToken, bookingId);
      const second = await approveBooking(h, ownerToken, bookingId);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(409);
      expect(second.json().code).toBe("BKG-T0005");
      expect(mocks.createBookingPaymentIntent).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /bookings/:id/reject", () => {
    it("rejects a requested booking, freeing the slot for a new booking", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-reject1@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-reject1@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await rejectBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "rejected" });
      expect(mocks.createBookingPaymentIntent).not.toHaveBeenCalled();

      // the slot is free again — a new booker can take it.
      const { token: secondBookerToken } = await registerAndGetToken(h, "booker-reject1b@x.com");
      const secondBookRes = await bookSlot(h, secondBookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      expect(secondBookRes.statusCode).toBe(201);
    });

    it("rejects a non-owner with 403 BKG-T0004", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-reject2@x.com", "request");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-reject2@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await rejectBooking(h, bookerToken, bookingId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("BKG-T0004");
    });

    it("rejects an instant-mode booking with 409 BKG-T0005", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-reject3@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-reject3@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await rejectBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });
  });

  describe("POST /bookings/:id/complete", () => {
    it("completes a confirmed deposit-mode booking", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-complete1@x.com", "deposit", {
        depositPercent: 30,
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-complete1@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      // simulate the webhook-driven transition to `confirmed` (B8, not yet
      // implemented) with a direct DB write.
      await h.prisma.booking.update({ where: { id: bookingId }, data: { status: "confirmed" } });

      const res = await completeBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "completed" });
    });

    it("rejects a non-owner with 403 BKG-T0004", async () => {
      const { courtId } = await setUpBookableCourt(h, "owner-complete2@x.com", "deposit", {
        depositPercent: 30,
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-complete2@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      await h.prisma.booking.update({ where: { id: bookingId }, data: { status: "confirmed" } });

      const res = await completeBooking(h, bookerToken, bookingId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("BKG-T0004");
    });

    it("rejects a deposit-mode booking still pending_payment with 409 BKG-T0005", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-complete3@x.com", "deposit", {
        depositPercent: 30,
      });
      const { token: bookerToken } = await registerAndGetToken(h, "booker-complete3@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;

      const res = await completeBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });

    it("rejects a confirmed instant-mode booking (wrong mode) with 409 BKG-T0005", async () => {
      const { ownerToken, courtId } = await setUpBookableCourt(h, "owner-complete4@x.com", "instant");
      const { token: bookerToken } = await registerAndGetToken(h, "booker-complete4@x.com");
      const bookRes = await bookSlot(h, bookerToken, {
        courtId,
        date: MONDAY,
        startMinute: 600,
        endMinute: 660,
      });
      const bookingId = bookRes.json().booking.id as string;
      await h.prisma.booking.update({ where: { id: bookingId }, data: { status: "confirmed" } });

      const res = await completeBooking(h, ownerToken, bookingId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("BKG-T0005");
    });
  });
});
