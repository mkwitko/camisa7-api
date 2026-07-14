import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("matchesRepository (integration)", () => {
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

  describe("insert", () => {
    it("inserts a match with status open and the given fields", async () => {
      const groupId = await createGroupId();

      const match = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 1500,
        slots: 14,
        pixKey: "owner@pix.com",
      });

      expect(match).toMatchObject({
        groupId,
        location: "Quadra Central",
        priceCents: 1500,
        slots: 14,
        pixKey: "owner@pix.com",
        status: "open",
        recurrenceRule: null,
      });
      expect(match.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(match.datetime).toBe("2026-08-01T20:00:00.000Z");
      expect(typeof match.createdAt).toBe("string");
    });

    it("defaults pixKey to null and stores a recurrenceRule when given", async () => {
      const groupId = await createGroupId();

      const match = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
        recurrenceRule: { weekly: true, weekday: 3, time: "20:00" },
      });

      expect(match.pixKey).toBeNull();
      expect(match.recurrenceRule).toEqual({ weekly: true, weekday: 3, time: "20:00" });
    });
  });

  describe("findById", () => {
    it("returns the domain match", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
      });

      const found = await repo.findById(inserted.id);

      expect(found).toEqual(inserted);
    });

    it("returns null for an unknown id", async () => {
      expect(await repo.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  });

  describe("listByGroup", () => {
    it("excludes finished matches by default", async () => {
      const groupId = await createGroupId();
      const open = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Open Match",
        priceCents: 0,
        slots: 10,
      });
      const finished = await repo.insert({
        groupId,
        datetime: "2026-07-01T20:00:00.000Z",
        location: "Finished Match",
        priceCents: 0,
        slots: 10,
      });
      await repo.setStatus(finished.id, "finished");

      const matches = await repo.listByGroup(groupId, { includeFinished: false });

      expect(matches).toHaveLength(1);
      expect(matches[0]?.id).toBe(open.id);
    });

    it("includes finished matches when includeFinished is true", async () => {
      const groupId = await createGroupId();
      await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Open Match",
        priceCents: 0,
        slots: 10,
      });
      const finished = await repo.insert({
        groupId,
        datetime: "2026-07-01T20:00:00.000Z",
        location: "Finished Match",
        priceCents: 0,
        slots: 10,
      });
      await repo.setStatus(finished.id, "finished");

      const matches = await repo.listByGroup(groupId, { includeFinished: true });

      expect(matches).toHaveLength(2);
    });

    it("includes cancelled matches even when includeFinished is false", async () => {
      const groupId = await createGroupId();
      const cancelled = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Cancelled Match",
        priceCents: 0,
        slots: 10,
      });
      await repo.setStatus(cancelled.id, "cancelled");

      const matches = await repo.listByGroup(groupId, { includeFinished: false });

      expect(matches).toHaveLength(1);
      expect(matches[0]?.status).toBe("cancelled");
    });

    it("does not return another group's matches", async () => {
      const groupIdA = await createGroupId();
      const groupIdB = await createGroupId();
      await repo.insert({
        groupId: groupIdA,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "A's Match",
        priceCents: 0,
        slots: 10,
      });
      await repo.insert({
        groupId: groupIdB,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "B's Match",
        priceCents: 0,
        slots: 10,
      });

      const matches = await repo.listByGroup(groupIdA, { includeFinished: true });

      expect(matches).toHaveLength(1);
      expect(matches[0]?.groupId).toBe(groupIdA);
    });

    it("orders matches by datetime ascending", async () => {
      const groupId = await createGroupId();
      await repo.insert({
        groupId,
        datetime: "2026-08-10T20:00:00.000Z",
        location: "Later",
        priceCents: 0,
        slots: 10,
      });
      await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Earlier",
        priceCents: 0,
        slots: 10,
      });

      const matches = await repo.listByGroup(groupId, { includeFinished: true });

      expect(matches.map((m) => m.location)).toEqual(["Earlier", "Later"]);
    });
  });

  describe("update", () => {
    it("updates the given fields and leaves the rest untouched", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 1000,
        slots: 10,
      });

      const updated = await repo.update(inserted.id, { location: "New Place", priceCents: 2000 });

      expect(updated).toMatchObject({
        id: inserted.id,
        location: "New Place",
        priceCents: 2000,
        slots: 10,
      });
    });

    it("updates recurrenceRule to null, clearing a previous rule", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
        recurrenceRule: { weekly: true, weekday: 1, time: "19:00" },
      });

      const updated = await repo.update(inserted.id, { recurrenceRule: null });

      expect(updated.recurrenceRule).toBeNull();
    });
  });

  describe("setStatus", () => {
    it("updates the match's status", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
      });

      const cancelled = await repo.setStatus(inserted.id, "cancelled");

      expect(cancelled.status).toBe("cancelled");
    });

    it("runs inside a given transaction when tx is passed", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
      });

      await testDb.prisma.$transaction(async (tx) => {
        const result = await repo.setStatus(inserted.id, "finished", tx);
        expect(result.status).toBe("finished");
      });

      const found = await repo.findById(inserted.id);
      expect(found?.status).toBe("finished");
    });
  });
});
