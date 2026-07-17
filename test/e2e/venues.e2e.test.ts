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
      amenities: ["gramado", "iluminacao"],
      phone: "11999998888",
      ...body,
    },
  });

describe("venues e2e", () => {
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

  describe("POST /venues", () => {
    it("creates a venue for a user with the `quadra` role", async () => {
      const { token, userId } = await registerAndGetToken(h, "q@x.com", ["jogador", "quadra"]);

      const res = await createVenue(h, token);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: "Arena Central",
        city: "São Paulo",
        amenities: ["gramado", "iluminacao"],
        ownerId: userId,
      });
    });

    it("rejects with 403 VEN-T0001 when the user lacks the `quadra` role", async () => {
      const { token } = await registerAndGetToken(h, "player@x.com");

      const res = await createVenue(h, token);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VEN-T0001");
    });

    it("unlocks creation after PATCH /auth/me/roles adds `quadra`", async () => {
      const { token } = await registerAndGetToken(h, "later@x.com");

      const patch = await h.app.inject({
        method: "PATCH",
        url: "/auth/me/roles",
        headers: { authorization: `Bearer ${token}` },
        payload: { roles: ["jogador", "quadra"] },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().roles).toEqual(["jogador", "quadra"]);

      const res = await createVenue(h, token);
      expect(res.statusCode).toBe(201);
    });

    it("rejects with 401 without a bearer token", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/venues",
        payload: { name: "X", latitude: 0, longitude: 0, address: "a", city: "c" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /venues/mine", () => {
    it("returns only the caller's own venues", async () => {
      const { token: tokenA } = await registerAndGetToken(h, "a@x.com", ["quadra"]);
      const { token: tokenB } = await registerAndGetToken(h, "b@x.com", ["quadra"]);
      await createVenue(h, tokenA, { name: "A Arena" });
      await createVenue(h, tokenB, { name: "B Arena" });

      const res = await h.app.inject({
        method: "GET",
        url: "/venues/mine",
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const venues = res.json();
      expect(venues).toHaveLength(1);
      expect(venues[0]).toMatchObject({ name: "A Arena" });
    });
  });

  describe("GET /venues/:id", () => {
    it("returns any venue for an authenticated caller", async () => {
      const { token: ownerToken } = await registerAndGetToken(h, "owner@x.com", ["quadra"]);
      const created = await createVenue(h, ownerToken, { name: "Public Arena" });
      const venueId = created.json().id as string;

      const { token: otherToken } = await registerAndGetToken(h, "other@x.com");
      const res = await h.app.inject({
        method: "GET",
        url: `/venues/${venueId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: venueId, name: "Public Arena" });
    });

    it("returns 404 VEN-T0002 for an unknown venue", async () => {
      const { token } = await registerAndGetToken(h, "someone@x.com");
      const res = await h.app.inject({
        method: "GET",
        url: "/venues/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("VEN-T0002");
    });
  });

  describe("PATCH /venues/:id", () => {
    it("lets the owner edit the venue", async () => {
      const { token } = await registerAndGetToken(h, "owner2@x.com", ["quadra"]);
      const created = await createVenue(h, token);
      const venueId = created.json().id as string;

      const res = await h.app.inject({
        method: "PATCH",
        url: `/venues/${venueId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Arena Renovada", amenities: ["bar"], phone: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: "Arena Renovada", amenities: ["bar"], phone: null });
    });

    it("rejects with 403 VEN-T0003 when the caller isn't the owner", async () => {
      const { token: ownerToken } = await registerAndGetToken(h, "owner3@x.com", ["quadra"]);
      const created = await createVenue(h, ownerToken);
      const venueId = created.json().id as string;

      const { token: intruderToken } = await registerAndGetToken(h, "intruder@x.com", ["quadra"]);
      const res = await h.app.inject({
        method: "PATCH",
        url: `/venues/${venueId}`,
        headers: { authorization: `Bearer ${intruderToken}` },
        payload: { name: "Hijacked" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VEN-T0003");
    });
  });
});
