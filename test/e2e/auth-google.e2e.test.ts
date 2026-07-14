import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

/**
 * The fake `google` gateway (test/mocks/gateways.fake.ts) decodes the
 * convention `"g:<sub>:<email>:<name>"` in place of a real Google ID token —
 * no network call, no real JWT. Anything else is rejected as AUTH-T0005.
 */
const googleToken = (sub: string, email: string, name: string) => `g:${sub}:${email}:${name}`;

const loginGoogle = (h: TestApp, idToken: string) =>
  h.app.inject({ method: "POST", url: "/auth/login-google", payload: { idToken } });

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

describe("auth google e2e", () => {
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

  describe("POST /auth/login-google", () => {
    it("creates a new account on first google login (hasPassword: false)", async () => {
      const res = await loginGoogle(h, googleToken("g-sub-1", "new@x.com", "New Person"));

      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({
        email: "new@x.com",
        name: "New Person",
        hasPassword: false,
        googleSub: "g-sub-1",
      });
      expect(typeof res.json().accessToken).toBe("string");
      expect(typeof res.json().refreshToken).toBe("string");
    });

    it("logs back in the same google account on a subsequent login (no duplicate)", async () => {
      const first = await loginGoogle(h, googleToken("g-sub-2", "again@x.com", "Again"));
      const second = await loginGoogle(h, googleToken("g-sub-2", "again@x.com", "Again"));

      expect(second.statusCode).toBe(200);
      expect(second.json().user.id).toBe(first.json().user.id);
    });

    it("links google to an existing password account with the same email", async () => {
      const registerRes = await register(h, "existing@x.com", { name: "Existing" });
      const existingId = registerRes.json().user.id;

      const res = await loginGoogle(h, googleToken("g-sub-3", "existing@x.com", "Existing Google"));

      expect(res.statusCode).toBe(200);
      expect(res.json().user.id).toBe(existingId);
      // Linked account keeps its pre-existing password.
      expect(res.json().user.hasPassword).toBe(true);
      expect(res.json().user.googleSub).toBe("g-sub-3");
    });

    it("rejects a malformed google token with 401 AUTH-T0005", async () => {
      const res = await loginGoogle(h, "not-a-real-google-token");

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH-T0005");
    });

    it("rejects an empty body with 400", async () => {
      const res = await h.app.inject({ method: "POST", url: "/auth/login-google", payload: {} });

      expect(res.statusCode).toBe(400);
    });
  });
});
