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
        seriesId: null,
        detached: false,
      });
      expect(match.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(match.datetime).toBe("2026-08-01T20:00:00.000Z");
      expect(typeof match.createdAt).toBe("string");
    });

    it("defaults pixKey to null when omitted", async () => {
      const groupId = await createGroupId();

      const match = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
      });

      expect(match.pixKey).toBeNull();
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

    it("sets detached when patched explicitly", async () => {
      const groupId = await createGroupId();
      const inserted = await repo.insert({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 0,
        slots: 10,
      });

      const updated = await repo.update(inserted.id, { detached: true });

      expect(updated.detached).toBe(true);
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

  async function createSeriesId(groupId: string): Promise<string> {
    const series = await testDb.prisma.matchSeries.create({
      data: {
        groupId,
        rule: { type: "weekly", weekday: 3 },
        location: "Quadra Central",
        priceCents: 1000,
        slots: 10,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    return series.id;
  }

  describe("listBySeriesFuture / countFutureBySeries", () => {
    it("returns only future occurrences of the series, chronological", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);
      const now = new Date("2026-08-01T00:00:00.000Z");

      const past = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-07-01T20:00:00.000Z",
        location: "Past",
        priceCents: 0,
        slots: 10,
      });
      const laterFuture = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-15T20:00:00.000Z",
        location: "Later",
        priceCents: 0,
        slots: 10,
      });
      const earlierFuture = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-08T20:00:00.000Z",
        location: "Earlier",
        priceCents: 0,
        slots: 10,
      });

      const future = await repo.listBySeriesFuture(seriesId, now);

      expect(future.map((m) => m.id)).toEqual([earlierFuture.id, laterFuture.id]);
      expect(future.every((m) => m.seriesId === seriesId)).toBe(true);
      expect(future.some((m) => m.id === past.id)).toBe(false);

      expect(await repo.countFutureBySeries(seriesId, now)).toBe(2);
    });

    it("does not count another series' matches", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);
      const otherSeriesId = await createSeriesId(groupId);
      const now = new Date("2026-08-01T00:00:00.000Z");

      await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-15T20:00:00.000Z",
        location: "Mine",
        priceCents: 0,
        slots: 10,
      });
      await repo.insertOccurrence({
        groupId,
        seriesId: otherSeriesId,
        datetime: "2026-08-15T20:00:00.000Z",
        location: "Other",
        priceCents: 0,
        slots: 10,
      });

      expect(await repo.countFutureBySeries(seriesId, now)).toBe(1);
    });
  });

  describe("insertOccurrence", () => {
    it("inserts a match linked to the series", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);

      const match = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-15T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 1000,
        slots: 10,
        pixKey: "owner@pix.com",
      });

      expect(match).toMatchObject({
        groupId,
        seriesId,
        detached: false,
        status: "open",
        pixKey: "owner@pix.com",
      });
    });
  });

  describe("updateFutureNonDetached", () => {
    it("updates simple fields only on future, non-detached occurrences", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);
      const now = new Date("2026-08-01T00:00:00.000Z");

      const future1 = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-08T20:00:00.000Z",
        location: "Old",
        priceCents: 1000,
        slots: 10,
      });
      const future2 = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-15T20:00:00.000Z",
        location: "Old",
        priceCents: 1000,
        slots: 10,
      });
      const detached = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-22T20:00:00.000Z",
        location: "Old",
        priceCents: 1000,
        slots: 10,
      });
      await repo.update(detached.id, { detached: true });
      const past = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-07-01T20:00:00.000Z",
        location: "Old",
        priceCents: 1000,
        slots: 10,
      });

      const count = await repo.updateFutureNonDetached(seriesId, now, {
        location: "New Place",
        priceCents: 2000,
      });

      expect(count).toBe(2);
      expect((await repo.findById(future1.id))?.location).toBe("New Place");
      expect((await repo.findById(future1.id))?.priceCents).toBe(2000);
      expect((await repo.findById(future2.id))?.location).toBe("New Place");
      expect((await repo.findById(detached.id))?.location).toBe("Old");
      expect((await repo.findById(past.id))?.location).toBe("Old");
    });

    it("recomputes datetime in UTC, keeping the date, when patch.time is given", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);
      const now = new Date("2026-08-01T00:00:00.000Z");

      const future = await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-08T20:00:00.000Z",
        location: "Quadra",
        priceCents: 0,
        slots: 10,
      });

      const count = await repo.updateFutureNonDetached(seriesId, now, { time: "18:30" });

      expect(count).toBe(1);
      const updated = await repo.findById(future.id);
      expect(updated?.datetime).toBe("2026-08-08T18:30:00.000Z");
    });

    it("returns 0 and updates nothing when the patch is empty", async () => {
      const groupId = await createGroupId();
      const seriesId = await createSeriesId(groupId);
      const now = new Date("2026-08-01T00:00:00.000Z");
      await repo.insertOccurrence({
        groupId,
        seriesId,
        datetime: "2026-08-08T20:00:00.000Z",
        location: "Quadra",
        priceCents: 0,
        slots: 10,
      });

      const count = await repo.updateFutureNonDetached(seriesId, now, {});

      expect(count).toBe(0);
    });
  });
});
