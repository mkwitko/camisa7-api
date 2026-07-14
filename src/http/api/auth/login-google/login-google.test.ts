import { describe, expect, it, vi } from "vitest";
import type { GoogleGateway } from "@/gateways/google/google.gateway";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import { createLoginGoogleService } from "./login-google.service";

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  hasPassword: true,
  googleSub: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function makeFakeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    findByGoogleSub: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(aUser()),
    linkGoogle: vi.fn().mockResolvedValue(undefined),
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

function makeFakeGoogle(
  claims: { googleSub: string; email: string; name: string } = {
    googleSub: "g-sub-1",
    email: "a@b.com",
    name: "Alice",
  },
): GoogleGateway {
  return { verifyIdToken: vi.fn().mockResolvedValue(claims) };
}

describe("createLoginGoogleService", () => {
  it("creates a brand-new account (hasPassword: false) on first google login", async () => {
    const repo = makeFakeRepo({
      insert: vi
        .fn()
        .mockResolvedValue(aUser({ id: "u-new", hasPassword: false, googleSub: "g-sub-1" })),
    });
    const google = makeFakeGoogle({ googleSub: "g-sub-1", email: "new@b.com", name: "New" });
    const service = createLoginGoogleService({ repo, jwt: makeFakeJwt(), google });

    const result = await service({ idToken: "irrelevant-in-fake" });

    expect(result.user).toMatchObject({ id: "u-new", hasPassword: false, googleSub: "g-sub-1" });
    expect(repo.insert).toHaveBeenCalledWith({
      email: "new@b.com",
      name: "New",
      googleSub: "g-sub-1",
    });
    expect(repo.linkGoogle).not.toHaveBeenCalled();
  });

  it("signs in directly when the googleSub is already linked", async () => {
    const existing = aUser({ id: "u-existing", googleSub: "g-sub-2" });
    const repo = makeFakeRepo({ findByGoogleSub: vi.fn().mockResolvedValue(existing) });
    const google = makeFakeGoogle({ googleSub: "g-sub-2", email: "a@b.com", name: "Alice" });
    const service = createLoginGoogleService({ repo, jwt: makeFakeJwt(), google });

    const result = await service({ idToken: "irrelevant-in-fake" });

    expect(result.user.id).toBe("u-existing");
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.linkGoogle).not.toHaveBeenCalled();
  });

  it("links google to an existing password account matched by email", async () => {
    const existing = { ...aUser({ id: "u-existing", hasPassword: true }), passwordHash: "hashed" };
    const repo = makeFakeRepo({ findByEmail: vi.fn().mockResolvedValue(existing) });
    const google = makeFakeGoogle({ googleSub: "g-sub-3", email: "a@b.com", name: "Alice" });
    const service = createLoginGoogleService({ repo, jwt: makeFakeJwt(), google });

    const result = await service({ idToken: "irrelevant-in-fake" });

    expect(result.user).toMatchObject({
      id: "u-existing",
      hasPassword: true,
      googleSub: "g-sub-3",
    });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(repo.linkGoogle).toHaveBeenCalledWith("u-existing", "g-sub-3");
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("propagates AUTH-T0005 from the google gateway for an invalid token", async () => {
    const repo = makeFakeRepo();
    const google: GoogleGateway = {
      verifyIdToken: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("bad"), { code: "AUTH-T0005" })),
    };
    const service = createLoginGoogleService({ repo, jwt: makeFakeJwt(), google });

    await expect(service({ idToken: "garbage" })).rejects.toMatchObject({ code: "AUTH-T0005" });
  });
});
