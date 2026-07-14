import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner" },
  });

async function registerAndGetToken(h: TestApp, email: string): Promise<string> {
  const res = await register(h, email);
  return res.json().accessToken as string;
}

const createGroup = (
  h: TestApp,
  token: string,
  body: { name: string; statsMode?: string } = { name: "Team A" },
) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

describe("groups e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Group", "User" CASCADE');
  });

  describe("POST /groups", () => {
    it("creates a group owned by the caller with statsMode defaulted to organizador", async () => {
      const token = await registerAndGetToken(h, "owner@x.com");

      const res = await createGroup(h, token, { name: "Team A" });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: "Team A", statsMode: "organizador" });
      expect(typeof res.json().id).toBe("string");
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/groups",
        payload: { name: "Team A" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("rejects an invalid body with 400", async () => {
      const token = await registerAndGetToken(h, "invalid@x.com");

      const res = await createGroup(h, token, { name: "" });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /groups", () => {
    it("returns only the caller's own groups", async () => {
      const tokenA = await registerAndGetToken(h, "a@x.com");
      const tokenB = await registerAndGetToken(h, "b@x.com");
      await createGroup(h, tokenA, { name: "A's Group" });
      await createGroup(h, tokenB, { name: "B's Group" });

      const res = await h.app.inject({
        method: "GET",
        url: "/groups",
        headers: { authorization: `Bearer ${tokenA}` },
      });

      expect(res.statusCode).toBe(200);
      const groups = res.json();
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({ name: "A's Group" });
    });

    it("returns an empty array when the caller owns no groups", async () => {
      const token = await registerAndGetToken(h, "empty@x.com");

      const res = await h.app.inject({
        method: "GET",
        url: "/groups",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({ method: "GET", url: "/groups" });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /groups/:id", () => {
    it("returns the group when the caller owns it", async () => {
      const token = await registerAndGetToken(h, "getowner@x.com");
      const created = await createGroup(h, token, { name: "My Group" });
      const { id } = created.json();

      const res = await h.app.inject({
        method: "GET",
        url: `/groups/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id, name: "My Group" });
    });

    it("returns 404 GRP-T0001 when another user's group is requested", async () => {
      const tokenA = await registerAndGetToken(h, "owner2@x.com");
      const tokenB = await registerAndGetToken(h, "other2@x.com");
      const created = await createGroup(h, tokenA, { name: "Owner2's Group" });
      const { id } = created.json();

      const res = await h.app.inject({
        method: "GET",
        url: `/groups/${id}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("GRP-T0001");
    });

    it("returns 404 GRP-T0001 for an unknown group id", async () => {
      const token = await registerAndGetToken(h, "unknown2@x.com");

      const res = await h.app.inject({
        method: "GET",
        url: "/groups/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("GRP-T0001");
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "GET",
        url: "/groups/00000000-0000-0000-0000-000000000000",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
