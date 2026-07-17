import argon2 from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import { createLoginService } from "./login.service";

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  hasPassword: true,
  googleSub: null,
  lastCity: null,
  lastLat: null,
  lastLng: null,
  stripeCustomerId: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function makeFakeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    findByGoogleSub: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    linkGoogle: vi.fn(),
    setPushToken: vi.fn(),
    getPushToken: vi.fn(),
    setLocation: vi.fn(),
    setStripeCustomerId: vi.fn(),
    ...overrides,
  };
}

function makeFakeJwt(): JwtGateway {
  return {
    signAccess: vi.fn().mockResolvedValue("access-token"),
    signRefresh: vi.fn().mockResolvedValue("refresh-token"),
    verifyAccess: vi.fn(),
    verifyRefresh: vi.fn(),
  };
}

describe("createLoginService", () => {
  it("logs in with the correct password and returns tokens", async () => {
    const passwordHash = await argon2.hash("s3cret!!");
    const repo = makeFakeRepo({
      findByEmail: vi.fn().mockResolvedValue({ ...aUser(), passwordHash }),
    });
    const jwt = makeFakeJwt();
    const service = createLoginService({ repo, jwt });

    const result = await service({ email: "a@b.com", password: "s3cret!!" });

    expect(result.user).toMatchObject({ email: "a@b.com", hasPassword: true });
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
  });

  it("rejects a wrong password with AUTH-T0003", async () => {
    const passwordHash = await argon2.hash("s3cret!!");
    const repo = makeFakeRepo({
      findByEmail: vi.fn().mockResolvedValue({ ...aUser(), passwordHash }),
    });
    const service = createLoginService({ repo, jwt: makeFakeJwt() });

    await expect(service({ email: "a@b.com", password: "wrong" })).rejects.toMatchObject({
      code: "AUTH-T0003",
    });
  });

  it("rejects a google-only account (null passwordHash) with AUTH-T0003", async () => {
    const repo = makeFakeRepo({
      findByEmail: vi.fn().mockResolvedValue({ ...aUser(), passwordHash: null }),
    });
    const service = createLoginService({ repo, jwt: makeFakeJwt() });

    await expect(service({ email: "a@b.com", password: "anything" })).rejects.toMatchObject({
      code: "AUTH-T0003",
    });
  });

  it("rejects an unknown email with AUTH-T0003", async () => {
    const repo = makeFakeRepo({ findByEmail: vi.fn().mockResolvedValue(null) });
    const service = createLoginService({ repo, jwt: makeFakeJwt() });

    await expect(service({ email: "ghost@b.com", password: "anything" })).rejects.toMatchObject({
      code: "AUTH-T0003",
    });
  });
});
