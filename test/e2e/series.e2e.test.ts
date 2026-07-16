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
});
