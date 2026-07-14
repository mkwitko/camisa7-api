import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import { createMeService } from "./me.service";

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
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    ...overrides,
  };
}

describe("createMeService", () => {
  it("returns the user by id", async () => {
    const user = aUser();
    const repo = makeFakeRepo({ findById: vi.fn().mockResolvedValue(user) });
    const service = createMeService({ repo });

    await expect(service("u1")).resolves.toEqual(user);
  });

  it("throws unauthorized when the user behind the token no longer exists", async () => {
    const repo = makeFakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = createMeService({ repo });

    await expect(service("ghost")).rejects.toMatchObject({ code: "AUTH-T0004" });
  });
});
