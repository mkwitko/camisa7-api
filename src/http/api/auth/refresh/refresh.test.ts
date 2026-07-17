import { describe, expect, it, vi } from "vitest";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import { createRefreshService } from "./refresh.service";

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  roles: ["jogador"],
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
    setRoles: vi.fn(),
    setPushToken: vi.fn(),
    getPushToken: vi.fn(),
    setLocation: vi.fn(),
    setStripeCustomerId: vi.fn(),
    ...overrides,
  };
}

function makeFakeJwt(overrides: Partial<JwtGateway> = {}): JwtGateway {
  return {
    signAccess: vi.fn().mockResolvedValue("new-access-token"),
    signRefresh: vi.fn().mockResolvedValue("new-refresh-token"),
    verifyAccess: vi.fn(),
    verifyRefresh: vi.fn().mockResolvedValue({ sub: "u1" }),
    ...overrides,
  };
}

describe("createRefreshService", () => {
  it("rotates a valid refresh token into a new access + refresh pair", async () => {
    const repo = makeFakeRepo({ findById: vi.fn().mockResolvedValue(aUser()) });
    const jwt = makeFakeJwt();
    const service = createRefreshService({ repo, jwt });

    const result = await service({ refreshToken: "old-refresh-token" });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(result.user).toMatchObject({ id: "u1", email: "a@b.com" });
    expect(jwt.verifyRefresh).toHaveBeenCalledWith("old-refresh-token");
    expect(jwt.signAccess).toHaveBeenCalledWith({ sub: "u1" });
    expect(jwt.signRefresh).toHaveBeenCalledWith({ sub: "u1" });
  });

  it("propagates AUTH-T0001 from the jwt gateway for a garbage token", async () => {
    const repo = makeFakeRepo();
    const jwt = makeFakeJwt({
      verifyRefresh: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("bad"), { code: "AUTH-T0001" })),
    });
    const service = createRefreshService({ repo, jwt });

    await expect(service({ refreshToken: "garbage" })).rejects.toMatchObject({
      code: "AUTH-T0001",
    });
  });

  it("rejects with AUTH-T0004 when the token verifies but the user no longer exists", async () => {
    const repo = makeFakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const jwt = makeFakeJwt();
    const service = createRefreshService({ repo, jwt });

    await expect(service({ refreshToken: "still-valid" })).rejects.toMatchObject({
      code: "AUTH-T0004",
    });
  });
});
