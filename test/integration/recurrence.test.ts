import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { generateNextOccurrences } from "../../src/jobs/recurrence.job";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("generateNextOccurrences (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe('TRUNCATE TABLE "Match", "Group", "User" CASCADE');
  });

  async function createGroupId(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    return group.id;
  }

  it("creates the next weekly occurrence for a finished recurring match with no future sibling", async () => {
    const groupId = await createGroupId();
    const original = await repo.insert({
      groupId,
      // Thursday 2026-07-09.
      datetime: "2026-07-09T23:00:00.000Z",
      location: "Quadra Central",
      priceCents: 1500,
      slots: 14,
      pixKey: "owner@pix.com",
      recurrenceRule: { weekly: true, weekday: 4, time: "20:00" },
    });
    await repo.setStatus(original.id, "finished");

    const created = await generateNextOccurrences(repo, new Date("2026-07-10T00:00:00.000Z"));

    expect(created).toHaveLength(1);
    const next = created[0];
    expect(next?.status).toBe("open");
    expect(next?.groupId).toBe(groupId);
    expect(next?.location).toBe("Quadra Central");
    expect(next?.priceCents).toBe(1500);
    expect(next?.slots).toBe(14);
    expect(next?.pixKey).toBe("owner@pix.com");
    expect(next?.recurrenceRule).toEqual({ weekly: true, weekday: 4, time: "20:00" });
    // Next Thursday after 2026-07-09 is 2026-07-16.
    expect(next?.datetime.startsWith("2026-07-16")).toBe(true);
    expect(new Date(next?.datetime ?? "").getUTCDay()).toBe(4);
  });

  it("returns an empty array when a future open/full sibling already exists", async () => {
    const groupId = await createGroupId();
    const original = await repo.insert({
      groupId,
      datetime: "2026-07-09T23:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
      recurrenceRule: { weekly: true, weekday: 4, time: "20:00" },
    });
    await repo.setStatus(original.id, "finished");
    await repo.insert({
      groupId,
      datetime: "2026-07-16T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
      recurrenceRule: { weekly: true, weekday: 4, time: "20:00" },
    });

    const created = await generateNextOccurrences(repo, new Date("2026-07-10T00:00:00.000Z"));

    expect(created).toEqual([]);
  });

  it("does not generate for a match without a recurrenceRule", async () => {
    const groupId = await createGroupId();
    const original = await repo.insert({
      groupId,
      datetime: "2026-07-09T23:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
    });
    await repo.setStatus(original.id, "finished");

    const created = await generateNextOccurrences(repo, new Date("2026-07-10T00:00:00.000Z"));

    expect(created).toEqual([]);
  });

  it("does not generate for a match that is not finished", async () => {
    const groupId = await createGroupId();
    await repo.insert({
      groupId,
      datetime: "2026-07-09T23:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
      recurrenceRule: { weekly: true, weekday: 4, time: "20:00" },
    });

    const created = await generateNextOccurrences(repo, new Date("2026-07-10T00:00:00.000Z"));

    expect(created).toEqual([]);
  });
});
