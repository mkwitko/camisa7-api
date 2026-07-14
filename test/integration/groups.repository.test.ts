import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("groupsRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe('TRUNCATE TABLE "Group", "User" CASCADE');
  });

  it("inserts a group owned by the given user, defaulting nothing implicit", async () => {
    const ownerId = await createOwner(testDb.prisma);

    const group = await repo.insert(buildGroupInput(ownerId, { name: "Team A" }));

    expect(group).toMatchObject({ name: "Team A", ownerId, statsMode: "organizador" });
    expect(group.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof group.createdAt).toBe("string");
  });

  it("inserts a group with an explicit statsMode", async () => {
    const ownerId = await createOwner(testDb.prisma);

    const group = await repo.insert(buildGroupInput(ownerId, { statsMode: "colaborativo" }));

    expect(group.statsMode).toBe("colaborativo");
  });

  it("findById returns the domain group", async () => {
    const ownerId = await createOwner(testDb.prisma);
    const inserted = await repo.insert(buildGroupInput(ownerId, { name: "Find Me" }));

    const found = await repo.findById(inserted.id);

    expect(found).toEqual(inserted);
  });

  it("findById returns null for an unknown id", async () => {
    expect(await repo.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("listOwnedBy returns only groups owned by the given user, not another owner's groups", async () => {
    const ownerA = await createOwner(testDb.prisma);
    const ownerB = await createOwner(testDb.prisma);
    await repo.insert(buildGroupInput(ownerA, { name: "A1" }));
    await repo.insert(buildGroupInput(ownerA, { name: "A2" }));
    await repo.insert(buildGroupInput(ownerB, { name: "B1" }));

    const ownedByA = await repo.listOwnedBy(ownerA);

    expect(ownedByA).toHaveLength(2);
    expect(ownedByA.map((g) => g.name).sort()).toEqual(["A1", "A2"]);
    expect(ownedByA.every((g) => g.ownerId === ownerA)).toBe(true);
  });

  it("listOwnedBy returns an empty array for an owner with no groups", async () => {
    const ownerId = await createOwner(testDb.prisma);

    expect(await repo.listOwnedBy(ownerId)).toEqual([]);
  });
});
