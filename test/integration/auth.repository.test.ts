import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthRepository } from "../../src/http/api/auth/auth.repository";
import { startTestDb, type TestDb } from "./helpers/db";

describe("authRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createAuthRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createAuthRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  });

  it("inserts a user and derives hasPassword from a non-null passwordHash", async () => {
    const user = await repo.insert({ email: "a@b.com", name: "Alice", passwordHash: "hashed" });

    expect(user).toMatchObject({
      email: "a@b.com",
      name: "Alice",
      hasPassword: true,
      googleSub: null,
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("inserts a google-only user (no passwordHash) with hasPassword false", async () => {
    const user = await repo.insert({
      email: "google@b.com",
      name: "Google User",
      googleSub: "g-sub-1",
    });

    expect(user).toMatchObject({ hasPassword: false, googleSub: "g-sub-1" });
  });

  it("findByEmail returns the user with the raw passwordHash", async () => {
    await repo.insert({ email: "find@b.com", name: "Find Me", passwordHash: "hashed" });

    const found = await repo.findByEmail("find@b.com");

    expect(found).toMatchObject({ email: "find@b.com", passwordHash: "hashed" });
  });

  it("findByEmail returns null for an unknown email", async () => {
    expect(await repo.findByEmail("missing@b.com")).toBeNull();
  });

  it("findById returns the domain user without passwordHash", async () => {
    const inserted = await repo.insert({
      email: "byid@b.com",
      name: "By Id",
      passwordHash: "hashed",
    });

    const found = await repo.findById(inserted.id);

    expect(found).toEqual(inserted);
    expect(found).not.toHaveProperty("passwordHash");
  });

  it("findById returns null for an unknown id", async () => {
    expect(await repo.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("surfaces a duplicate email as AUTH-T0002 (Prisma P2002)", async () => {
    await repo.insert({ email: "dup@b.com", name: "First" });

    await expect(repo.insert({ email: "dup@b.com", name: "Second" })).rejects.toMatchObject({
      code: "AUTH-T0002",
    });
  });

  it("findByGoogleSub returns the domain user for a linked googleSub", async () => {
    const inserted = await repo.insert({
      email: "gsub@b.com",
      name: "G Sub",
      googleSub: "g-sub-find",
    });

    const found = await repo.findByGoogleSub("g-sub-find");

    expect(found).toEqual(inserted);
  });

  it("findByGoogleSub returns null for an unknown googleSub", async () => {
    expect(await repo.findByGoogleSub("missing-sub")).toBeNull();
  });

  it("linkGoogle sets googleSub on an existing user without touching the password", async () => {
    const inserted = await repo.insert({
      email: "link@b.com",
      name: "Link Me",
      passwordHash: "hashed",
    });
    expect(inserted.googleSub).toBeNull();

    await repo.linkGoogle(inserted.id, "g-sub-linked");

    const found = await repo.findById(inserted.id);
    expect(found).toMatchObject({ googleSub: "g-sub-linked", hasPassword: true });
  });
});
