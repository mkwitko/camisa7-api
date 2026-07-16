import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner" },
  });

async function registerAndGetToken(h: TestApp, email: string): Promise<string> {
  const res = await register(h, email);
  return res.json().accessToken as string;
}

const createGroup = (h: TestApp, token: string, body: { name: string } = { name: "Team A" }) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const createSeries = (
  h: TestApp,
  token: string,
  groupId: string,
  body: Record<string, unknown> = {},
) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/series`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      rule: { kind: "weekly", weekdays: [2], interval: 1 },
      time: "20:00",
      location: "Quadra Central",
      slots: 10,
      startDate: "2026-08-01T00:00:00.000Z",
      ...body,
    },
  });

const listGroupSeries = (h: TestApp, token: string, groupId: string) =>
  h.app.inject({
    method: "GET",
    url: `/groups/${groupId}/series`,
    headers: { authorization: `Bearer ${token}` },
  });

const getSeries = (h: TestApp, token: string, seriesId: string) =>
  h.app.inject({
    method: "GET",
    url: `/series/${seriesId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const updateSeries = (h: TestApp, token: string, seriesId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "PATCH",
    url: `/series/${seriesId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const endSeries = (h: TestApp, token: string, seriesId: string) =>
  h.app.inject({
    method: "DELETE",
    url: `/series/${seriesId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const addSeriesDates = (h: TestApp, token: string, seriesId: string, dates: string[]) =>
  h.app.inject({
    method: "POST",
    url: `/series/${seriesId}/dates`,
    headers: { authorization: `Bearer ${token}` },
    payload: { dates },
  });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Seeds a `Match` occurrence directly (no spawn endpoint exists yet — that's the recurrence job's job), at a given offset from "now" in days. */
async function seedOccurrence(
  h: TestApp,
  opts: {
    groupId: string;
    seriesId: string;
    offsetDays: number;
    location?: string;
    detached?: boolean;
  },
) {
  return h.prisma.match.create({
    data: {
      groupId: opts.groupId,
      seriesId: opts.seriesId,
      datetime: new Date(Date.now() + opts.offsetDays * DAY_MS),
      location: opts.location ?? "Quadra Central",
      priceCents: 1000,
      slots: 10,
      detached: opts.detached ?? false,
    },
  });
}

describe("series e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchSeries", "Match", "Group", "User" CASCADE',
    );
  });

  describe("POST /groups/:id/series", () => {
    it("creates a weekly series owned by the caller's group", async () => {
      const token = await registerAndGetToken(h, "owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createSeries(h, token, groupId, {
        priceCents: 1500,
        pixKey: "owner@pix.com",
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        groupId,
        location: "Quadra Central",
        priceCents: 1500,
        slots: 10,
        pixKey: "owner@pix.com",
        status: "active",
        time: "20:00",
      });
      expect(body.rule).toMatchObject({ kind: "weekly", weekdays: [2], interval: 1 });
      expect(typeof body.id).toBe("string");
    });

    it("accepts a manual rule with time null", async () => {
      const token = await registerAndGetToken(h, "owner-manual@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createSeries(h, token, groupId, {
        rule: { kind: "manual" },
        time: null,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.rule).toMatchObject({ kind: "manual" });
      expect(body.time).toBeNull();
    });

    it("rejects a non-manual rule with time null with 400", async () => {
      const token = await registerAndGetToken(h, "owner-refine@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createSeries(h, token, groupId, { time: null });

      expect(res.statusCode).toBe(400);
    });

    it("rejects slots below 2 with 400", async () => {
      const token = await registerAndGetToken(h, "owner-slots@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createSeries(h, token, groupId, { slots: 1 });

      expect(res.statusCode).toBe(400);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner2@x.com");
      const otherToken = await registerAndGetToken(h, "other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();

      const res = await createSeries(h, otherToken, groupId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });

    it("returns 404 for an unknown group id", async () => {
      const token = await registerAndGetToken(h, "owner-unknown@x.com");

      const res = await createSeries(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("GRP-T0001");
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/groups/00000000-0000-0000-0000-000000000000/series",
        payload: {
          rule: { kind: "weekly", weekdays: [2], interval: 1 },
          time: "20:00",
          location: "X",
          slots: 10,
          startDate: "2026-08-01T00:00:00.000Z",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /groups/:id/series", () => {
    it("lists series for the caller's group", async () => {
      const token = await registerAndGetToken(h, "list-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);

      const res = await listGroupSeries(h, token, groupId);

      expect(res.statusCode).toBe(200);
      const series = res.json();
      expect(series).toHaveLength(1);
      expect(series[0].id).toBe(created.json().id);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "list-owner3@x.com");
      const otherToken = await registerAndGetToken(h, "list-other3@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team C" });
      const { id: groupId } = group.json();

      const res = await listGroupSeries(h, otherToken, groupId);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /series/:id", () => {
    it("returns the series when the caller owns its group", async () => {
      const token = await registerAndGetToken(h, "get-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);
      const { id: seriesId } = created.json();

      const res = await getSeries(h, token, seriesId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: seriesId,
        groupId,
        rule: { kind: "weekly", weekdays: [2], interval: 1 },
      });
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "get-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "get-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, ownerToken, groupId);
      const { id: seriesId } = created.json();

      const res = await getSeries(h, otherToken, seriesId);

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 SER-T0001 for an unknown series id", async () => {
      const token = await registerAndGetToken(h, "get-unknown@x.com");

      const res = await getSeries(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("SER-T0001");
    });
  });

  describe("PATCH /series/:id", () => {
    it("propagates a template field to future non-detached occurrences, skipping detached and past ones", async () => {
      const token = await registerAndGetToken(h, "upd-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);
      const { id: seriesId } = created.json();

      const future = await seedOccurrence(h, { groupId, seriesId, offsetDays: 7 });
      const futureDetached = await seedOccurrence(h, {
        groupId,
        seriesId,
        offsetDays: 14,
        detached: true,
      });
      const past = await seedOccurrence(h, { groupId, seriesId, offsetDays: -7 });

      const res = await updateSeries(h, token, seriesId, { location: "Nova Quadra" });

      expect(res.statusCode).toBe(200);
      expect(res.json().location).toBe("Nova Quadra");

      const [futureRow, detachedRow, pastRow] = await Promise.all([
        h.prisma.match.findUniqueOrThrow({ where: { id: future.id } }),
        h.prisma.match.findUniqueOrThrow({ where: { id: futureDetached.id } }),
        h.prisma.match.findUniqueOrThrow({ where: { id: past.id } }),
      ]);
      expect(futureRow.location).toBe("Nova Quadra");
      expect(detachedRow.location).toBe("Quadra Central");
      expect(pastRow.location).toBe("Quadra Central");
    });

    it("does not touch existing occurrences when only rule changes", async () => {
      const token = await registerAndGetToken(h, "upd-rule-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);
      const { id: seriesId } = created.json();

      const future = await seedOccurrence(h, { groupId, seriesId, offsetDays: 7 });
      const originalDatetime = future.datetime.toISOString();

      const res = await updateSeries(h, token, seriesId, { rule: { kind: "manual" } });

      expect(res.statusCode).toBe(200);
      expect(res.json().rule).toMatchObject({ kind: "manual" });

      const futureRow = await h.prisma.match.findUniqueOrThrow({ where: { id: future.id } });
      expect(futureRow.location).toBe("Quadra Central");
      expect(futureRow.datetime.toISOString()).toBe(originalDatetime);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "upd-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "upd-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, ownerToken, groupId);
      const { id: seriesId } = created.json();

      const res = await updateSeries(h, otherToken, seriesId, { location: "X" });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /series/:id", () => {
    it("ends the series without cancelling future occurrences", async () => {
      const token = await registerAndGetToken(h, "end-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);
      const { id: seriesId } = created.json();
      const future = await seedOccurrence(h, { groupId, seriesId, offsetDays: 7 });

      const res = await endSeries(h, token, seriesId);

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ended");

      const futureRow = await h.prisma.match.findUniqueOrThrow({ where: { id: future.id } });
      expect(futureRow.status).toBe("open");
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "end-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "end-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, ownerToken, groupId);
      const { id: seriesId } = created.json();

      const res = await endSeries(h, otherToken, seriesId);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /series/:id/dates", () => {
    it("creates occurrences for a manual series and skips a duplicate date idempotently", async () => {
      const token = await registerAndGetToken(h, "dates-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId, {
        rule: { kind: "manual" },
        time: null,
      });
      const { id: seriesId } = created.json();

      const dateA = "2026-09-01T20:00:00.000Z";
      const dateB = "2026-09-08T20:00:00.000Z";

      const res = await addSeriesDates(h, token, seriesId, [dateA, dateB]);

      expect(res.statusCode).toBe(201);
      const createdMatches = res.json();
      expect(createdMatches).toHaveLength(2);
      expect(createdMatches[0]).toMatchObject({ seriesId, groupId, location: "Quadra Central" });

      const countAfterFirst = await h.prisma.match.count({ where: { seriesId } });
      expect(countAfterFirst).toBe(2);

      // Re-submitting one already-added date + one brand-new one: the
      // duplicate is skipped (idempotent), only the new one is created.
      const dateC = "2026-09-15T20:00:00.000Z";
      const res2 = await addSeriesDates(h, token, seriesId, [dateA, dateC]);

      expect(res2.statusCode).toBe(201);
      expect(res2.json()).toHaveLength(1);
      expect(res2.json()[0].datetime).toBe(dateC);

      const countAfterSecond = await h.prisma.match.count({ where: { seriesId } });
      expect(countAfterSecond).toBe(3);
    });

    it("rejects a non-manual series with 400 SER-T0002", async () => {
      const token = await registerAndGetToken(h, "dates-weekly-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, token, groupId);
      const { id: seriesId } = created.json();

      const res = await addSeriesDates(h, token, seriesId, ["2026-09-01T20:00:00.000Z"]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("SER-T0002");
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "dates-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "dates-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createSeries(h, ownerToken, groupId, {
        rule: { kind: "manual" },
        time: null,
      });
      const { id: seriesId } = created.json();

      const res = await addSeriesDates(h, otherToken, seriesId, ["2026-09-01T20:00:00.000Z"]);

      expect(res.statusCode).toBe(403);
    });
  });
});
