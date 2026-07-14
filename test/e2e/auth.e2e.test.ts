import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (
  h: TestApp,
  email: string,
  overrides: Partial<{ password: string; name: string }> = {},
) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: overrides.password ?? "s3cret!!", name: overrides.name ?? "Org" },
  });

const login = (h: TestApp, email: string, password: string) =>
  h.app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });

describe("auth e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  });

  describe("POST /auth/register", () => {
    it("registers an organizer and returns tokens", async () => {
      const res = await register(h, "org@x.com");

      expect(res.statusCode).toBe(201);
      expect(res.json().user).toMatchObject({ email: "org@x.com", name: "Org", hasPassword: true });
      expect(typeof res.json().accessToken).toBe("string");
      expect(typeof res.json().refreshToken).toBe("string");
    });

    it("rejects duplicate email with 409 AUTH-T0002", async () => {
      await register(h, "d@x.com");
      const res = await register(h, "d@x.com");

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("AUTH-T0002");
    });

    it("rejects an invalid body with 400", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "not-an-email", password: "short", name: "A" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /auth/login", () => {
    it("logs in with the right credentials and returns tokens", async () => {
      await register(h, "login@x.com", { password: "s3cret!!" });

      const res = await login(h, "login@x.com", "s3cret!!");

      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ email: "login@x.com" });
      expect(typeof res.json().accessToken).toBe("string");
    });

    it("rejects a wrong password with 401 AUTH-T0003", async () => {
      await register(h, "wrongpw@x.com", { password: "s3cret!!" });

      const res = await login(h, "wrongpw@x.com", "wrong-password");

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH-T0003");
    });

    it("rejects a login for an unknown email with 401 AUTH-T0003", async () => {
      const res = await login(h, "ghost@x.com", "whatever");

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH-T0003");
    });
  });

  describe("GET /auth/me", () => {
    it("returns 401 without a bearer token", async () => {
      const res = await h.app.inject({ method: "GET", url: "/auth/me" });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH-T0004");
    });

    it("returns 401 with a garbage bearer token", async () => {
      const res = await h.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: "Bearer not-a-real-token" },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH-T0001");
    });

    it("returns the authenticated user with a valid access token", async () => {
      const registerRes = await register(h, "me@x.com", { name: "Me" });
      const { accessToken } = registerRes.json();

      const res = await h.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: "me@x.com", name: "Me", hasPassword: true });
    });
  });
});
