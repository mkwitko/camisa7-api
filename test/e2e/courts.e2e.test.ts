import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, roles?: string[]) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner", ...(roles ? { roles } : {}) },
  });

async function registerAndGetToken(
  h: TestApp,
  email: string,
  roles?: string[],
): Promise<{ token: string; userId: string }> {
  const res = await register(h, email, roles);
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

const createVenue = (h: TestApp, token: string, body: Record<string, unknown> = {}) =>
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
      ...body,
    },
  });

async function createOwnedVenue(
  h: TestApp,
  email: string,
): Promise<{ token: string; venueId: string }> {
  const { token } = await registerAndGetToken(h, email, ["quadra"]);
  const created = await createVenue(h, token);
  return { token, venueId: created.json().id as string };
}

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

describe("courts e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Match", "Venue", "User" CASCADE');
  });

  describe("POST /venues/:venueId/courts", () => {
    it("creates a court for the venue owner, with no price rules yet", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner1@x.com");

      const res = await createCourt(h, token, venueId);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        venueId,
        name: "Quadra 1",
        modality: "futsal",
        slotMinutes: 60,
        bookingMode: "instant",
        active: true,
        priceRules: [],
      });
    });

    it("rejects with 422 CRT-T0004-shaped validation when bookingMode=deposit lacks depositPercent", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner-dep@x.com");

      const res = await createCourt(h, token, venueId, { bookingMode: "deposit" });

      // Schema-level `.refine` on `CreateCourtBody` — a 400 (zod validation),
      // not the application-level `CRT.DEPOSIT_PERCENT_REQUIRED` (which is
      // for PATCH, where the body can't be refined against DB state).
      expect(res.statusCode).toBe(400);
    });

    it("accepts bookingMode=deposit WITH depositPercent", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner-dep2@x.com");

      const res = await createCourt(h, token, venueId, {
        bookingMode: "deposit",
        depositPercent: 30,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ bookingMode: "deposit", depositPercent: 30 });
    });

    it("rejects with 403 VEN-T0003 when the caller doesn't own the venue", async () => {
      const { venueId } = await createOwnedVenue(h, "owner2@x.com");
      const { token: intruderToken } = await registerAndGetToken(h, "intruder@x.com", ["quadra"]);

      const res = await createCourt(h, intruderToken, venueId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VEN-T0003");
    });

    it("rejects with 404 VEN-T0002 for an unknown venue", async () => {
      const { token } = await registerAndGetToken(h, "someone@x.com", ["quadra"]);

      const res = await createCourt(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("VEN-T0002");
    });
  });

  describe("GET /venues/:venueId/courts", () => {
    it("lets the venue owner see inactive courts too", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner3@x.com");
      const created = await createCourt(h, token, venueId, { name: "Ativa" });
      const inactive = await createCourt(h, token, venueId, { name: "Inativa" });
      await h.app.inject({
        method: "PATCH",
        url: `/courts/${inactive.json().id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: false },
      });

      const res = await h.app.inject({
        method: "GET",
        url: `/venues/${venueId}/courts`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const names = (res.json() as Array<{ name: string }>).map((c) => c.name).sort();
      expect(names).toEqual(["Ativa", "Inativa"]);
      expect(created.statusCode).toBe(201);
    });

    it("hides inactive courts from a non-owner", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner4@x.com");
      await createCourt(h, token, venueId, { name: "Ativa" });
      const inactive = await createCourt(h, token, venueId, { name: "Inativa" });
      await h.app.inject({
        method: "PATCH",
        url: `/courts/${inactive.json().id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: false },
      });

      const { token: otherToken } = await registerAndGetToken(h, "other@x.com");
      const res = await h.app.inject({
        method: "GET",
        url: `/venues/${venueId}/courts`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(res.statusCode).toBe(200);
      const names = (res.json() as Array<{ name: string }>).map((c) => c.name);
      expect(names).toEqual(["Ativa"]);
    });
  });

  describe("PATCH /courts/:id", () => {
    it("lets the owner edit the court", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner5@x.com");
      const created = await createCourt(h, token, venueId);
      const courtId = created.json().id as string;

      const res = await h.app.inject({
        method: "PATCH",
        url: `/courts/${courtId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Quadra Renovada", surface: "grama sintética" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: "Quadra Renovada", surface: "grama sintética" });
    });

    it("rejects with 403 CRT-T0002 when the caller isn't the venue owner", async () => {
      const { token: ownerToken, venueId } = await createOwnedVenue(h, "owner6@x.com");
      const created = await createCourt(h, ownerToken, venueId);
      const courtId = created.json().id as string;

      const { token: intruderToken } = await registerAndGetToken(h, "intruder2@x.com", ["quadra"]);
      const res = await h.app.inject({
        method: "PATCH",
        url: `/courts/${courtId}`,
        headers: { authorization: `Bearer ${intruderToken}` },
        payload: { name: "Hijacked" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CRT-T0002");
    });

    it("rejects with 404 CRT-T0001 for an unknown court", async () => {
      const { token } = await registerAndGetToken(h, "someone2@x.com");
      const res = await h.app.inject({
        method: "PATCH",
        url: "/courts/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "X" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("CRT-T0001");
    });

    it("rejects with 422 CRT-T0004 when switching to deposit mode without depositPercent", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner7@x.com");
      const created = await createCourt(h, token, venueId);
      const courtId = created.json().id as string;

      const res = await h.app.inject({
        method: "PATCH",
        url: `/courts/${courtId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { bookingMode: "deposit" },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("CRT-T0004");
    });
  });

  describe("PUT /courts/:id/price-rules", () => {
    it("replaces the court's price rules (happy path: venue -> court -> price-rules)", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner8@x.com");
      const created = await createCourt(h, token, venueId);
      const courtId = created.json().id as string;

      const res = await h.app.inject({
        method: "PUT",
        url: `/courts/${courtId}/price-rules`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          rules: [
            { weekday: 1, startMinute: 0, endMinute: 720, priceCents: 8000 },
            { weekday: 1, startMinute: 720, endMinute: 1440, priceCents: 12000 },
            { weekday: 6, startMinute: 0, endMinute: 1440, priceCents: 15000 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().priceRules).toHaveLength(3);
      expect(res.json().priceRules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ weekday: 1, startMinute: 0, endMinute: 720, priceCents: 8000 }),
        ]),
      );
    });

    it("rejects with 422 CRT-T0003 when two rules overlap on the same weekday", async () => {
      const { token, venueId } = await createOwnedVenue(h, "owner9@x.com");
      const created = await createCourt(h, token, venueId);
      const courtId = created.json().id as string;

      const res = await h.app.inject({
        method: "PUT",
        url: `/courts/${courtId}/price-rules`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          rules: [
            { weekday: 1, startMinute: 0, endMinute: 90, priceCents: 8000 },
            { weekday: 1, startMinute: 60, endMinute: 120, priceCents: 9000 },
          ],
        },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("CRT-T0003");
    });

    it("rejects with 403 CRT-T0002 when the caller isn't the venue owner", async () => {
      const { token: ownerToken, venueId } = await createOwnedVenue(h, "owner10@x.com");
      const created = await createCourt(h, ownerToken, venueId);
      const courtId = created.json().id as string;

      const { token: intruderToken } = await registerAndGetToken(h, "intruder3@x.com", ["quadra"]);
      const res = await h.app.inject({
        method: "PUT",
        url: `/courts/${courtId}/price-rules`,
        headers: { authorization: `Bearer ${intruderToken}` },
        payload: { rules: [{ weekday: 1, startMinute: 0, endMinute: 60, priceCents: 1000 }] },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CRT-T0002");
    });
  });
});
