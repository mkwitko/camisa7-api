import { describe, expect, it, vi } from "vitest";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import { createRegisterService } from "./register.service";

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
  stripeAccountId: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function makeFakeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    findByGoogleSub: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(aUser()),
    linkGoogle: vi.fn(),
    setRoles: vi.fn(),
    setPushToken: vi.fn(),
    getPushToken: vi.fn(),
    setLocation: vi.fn(),
    setStripeCustomerId: vi.fn(),
    setStripeAccountId: vi.fn(),
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

describe("createRegisterService", () => {
  it("registers a new user, hashes the password, and returns tokens", async () => {
    const repo = makeFakeRepo();
    const jwt = makeFakeJwt();
    const service = createRegisterService({ repo, jwt });

    const result = await service({
      email: "a@b.com",
      password: "s3cret!!",
      name: "Alice",
      roles: ["jogador"],
    });

    expect(result.user).toMatchObject({ email: "a@b.com", name: "Alice", hasPassword: true });
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(jwt.signAccess).toHaveBeenCalledWith({ sub: "u1" });
    expect(jwt.signRefresh).toHaveBeenCalledWith({ sub: "u1" });

    const insertedArgs = vi.mocked(repo.insert).mock.calls[0]?.[0];
    expect(insertedArgs).toMatchObject({ email: "a@b.com", name: "Alice" });
    expect(insertedArgs?.passwordHash).toBeDefined();
    expect(insertedArgs?.passwordHash).not.toBe("s3cret!!");
  });

  it("rejects duplicate email with AUTH-T0002 before hitting the repo insert", async () => {
    const repo = makeFakeRepo({ findByEmail: vi.fn().mockResolvedValue(aUser()) });
    const jwt = makeFakeJwt();
    const service = createRegisterService({ repo, jwt });

    await expect(
      service({ email: "a@b.com", password: "s3cret!!", name: "Alice", roles: ["jogador"] }),
    ).rejects.toMatchObject({ code: "AUTH-T0002" });
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
