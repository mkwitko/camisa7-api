import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import {
  createSeriesRepository,
  type InsertSeriesInput,
} from "../../src/http/api/series/series.repository";
import type { RecurrenceRule } from "../../src/http/api/series/series.types";
import { generateHorizon } from "../../src/jobs/recurrence.job";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

// Mesma referência que `recurrence.test.ts` usa: janeiro/2026, Jan/1 = quinta
// (0=Dom..6=Sáb, logo weekday 3 = quarta). Jan/7, 14, 21, 28/2026 são quartas.
const STARTDATE = "2026-01-01T00:00:00.000Z";
const WEEKLY: RecurrenceRule = { kind: "weekly", weekdays: [3], interval: 1 };
const BIWEEKLY: RecurrenceRule = { kind: "weekly", weekdays: [3], interval: 2 };

describe("generateHorizon (integration)", () => {
  let testDb: TestDb;
  let seriesRepo: ReturnType<typeof createSeriesRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    seriesRepo = createSeriesRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchSeries", "Match", "Group", "User" CASCADE',
    );
  });

  async function createGroupId(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    return group.id;
  }

  async function seedSeries(
    groupId: string,
    overrides: Partial<InsertSeriesInput> = {},
  ): Promise<string> {
    const series = await seriesRepo.insert({
      groupId,
      rule: overrides.rule ?? WEEKLY,
      time: "time" in overrides ? overrides.time : "20:00",
      location: "Quadra Central",
      priceCents: 1500,
      slots: 14,
      pixKey: "owner@pix.com",
      startDate: overrides.startDate ?? STARTDATE,
      endDate: overrides.endDate,
      status: overrides.status,
    });
    return series.id;
  }

  it("creates exactly `horizon` occurrences for an active weekly series with none yet, spaced by the rule", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    const seriesId = await seedSeries(groupId);

    const created = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(created).toHaveLength(4);
    expect(created.map((m) => m.datetime)).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
      "2026-01-28T20:00:00.000Z",
    ]);
    for (const match of created) {
      expect(match.seriesId).toBe(seriesId);
      expect(match.groupId).toBe(groupId);
      expect(match.status).toBe("open");
    }
  });

  it("is idempotent — re-running immediately with the same `now` creates nothing more", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    await seedSeries(groupId);

    await generateHorizon(seriesRepo, matchesRepo, now);
    const secondRun = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(secondRun).toEqual([]);
  });

  it("tops up to `horizon` when only some future occurrences remain, anchoring after the last known one", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    const seriesId = await seedSeries(groupId);

    await generateHorizon(seriesRepo, matchesRepo, now);
    // Drop the two furthest-out occurrences (Jan/21, Jan/28), keep Jan/7, Jan/14.
    await testDb.prisma.match.deleteMany({
      where: { seriesId, datetime: { gte: new Date("2026-01-21T00:00:00.000Z") } },
    });

    const topUp = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(topUp.map((m) => m.datetime)).toEqual([
      "2026-01-21T20:00:00.000Z",
      "2026-01-28T20:00:00.000Z",
    ]);
    const total = await matchesRepo.listBySeriesFuture(seriesId, now);
    expect(total.map((m) => m.datetime)).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
      "2026-01-28T20:00:00.000Z",
    ]);
  });

  it("tops up a biweekly series on the correct (every-other-week) cadence", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    const seriesId = await seedSeries(groupId, { rule: BIWEEKLY });

    const created = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(created.map((m) => m.datetime)).toEqual([
      "2026-01-14T20:00:00.000Z",
      "2026-01-28T20:00:00.000Z",
      "2026-02-11T20:00:00.000Z",
      "2026-02-25T20:00:00.000Z",
    ]);
    expect(seriesId).toBeTruthy();
  });

  it("ignores a `manual` series (never generatable)", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    await seedSeries(groupId, { rule: { kind: "manual" }, time: null });

    const created = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(created).toEqual([]);
  });

  it("ignores a series with no `time` set", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    await seedSeries(groupId, { time: null });

    const created = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(created).toEqual([]);
  });

  it("ignores `paused` and `ended` series — not returned by listActive", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    await seedSeries(groupId, { status: "paused" });
    await seedSeries(groupId, { status: "ended" });

    const active = await seriesRepo.listActive(now);
    expect(active).toEqual([]);

    const created = await generateHorizon(seriesRepo, matchesRepo, now);
    expect(created).toEqual([]);
  });

  it("respects `endDate` — never inserts an occurrence past it", async () => {
    const now = new Date(STARTDATE);
    const groupId = await createGroupId();
    const seriesId = await seedSeries(groupId, { endDate: "2026-01-16T00:00:00.000Z" });

    const created = await generateHorizon(seriesRepo, matchesRepo, now);

    expect(created.map((m) => m.datetime)).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
    ]);
    const stillActive = await seriesRepo.listActive(now);
    expect(stillActive.map((s) => s.id)).toContain(seriesId);
  });
});
