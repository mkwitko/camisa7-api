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

const createMatch = (
  h: TestApp,
  token: string,
  groupId: string,
  body: Record<string, unknown> = {},
) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/matches`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      slots: 10,
      ...body,
    },
  });

const listMatches = (h: TestApp, token: string, groupId: string, includeFinished?: boolean) =>
  h.app.inject({
    method: "GET",
    url: `/groups/${groupId}/matches${includeFinished !== undefined ? `?includeFinished=${includeFinished}` : ""}`,
    headers: { authorization: `Bearer ${token}` },
  });

const getMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const updateMatch = (h: TestApp, token: string, matchId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "PATCH",
    url: `/matches/${matchId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const cancelMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("matches e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Match", "Group", "User" CASCADE');
  });

  describe("POST /groups/:id/matches", () => {
    it("creates a match owned by the caller's group with status open", async () => {
      const token = await registerAndGetToken(h, "owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createMatch(h, token, groupId, {
        datetime: "2026-08-01T20:00:00.000Z",
        location: "Quadra Central",
        priceCents: 1500,
        slots: 14,
        pixKey: "owner@pix.com",
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        groupId,
        location: "Quadra Central",
        priceCents: 1500,
        slots: 14,
        pixKey: "owner@pix.com",
        status: "open",
        seriesId: null,
        detached: false,
      });
      expect(typeof body.id).toBe("string");
      expect(body.datetime).toBe("2026-08-01T20:00:00.000Z");
    });

    it("defaults priceCents to 0 and seriesId/detached to null/false when omitted", async () => {
      const token = await registerAndGetToken(h, "owner-defaults@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createMatch(h, token, groupId);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        priceCents: 0,
        pixKey: null,
        seriesId: null,
        detached: false,
      });
    });

    it("rejects slots below 2 with 400", async () => {
      const token = await registerAndGetToken(h, "owner-slots@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createMatch(h, token, groupId, { slots: 1 });

      expect(res.statusCode).toBe(400);
    });

    it("rejects slots above 64 with 400", async () => {
      const token = await registerAndGetToken(h, "owner-slots-max@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();

      const res = await createMatch(h, token, groupId, { slots: 65 });

      expect(res.statusCode).toBe(400);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner2@x.com");
      const otherToken = await registerAndGetToken(h, "other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();

      const res = await createMatch(h, otherToken, groupId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });

    it("returns 404 for an unknown group id", async () => {
      const token = await registerAndGetToken(h, "owner-unknown@x.com");

      const res = await createMatch(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("GRP-T0001");
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/groups/00000000-0000-0000-0000-000000000000/matches",
        payload: { datetime: "2026-08-01T20:00:00.000Z", location: "X", slots: 10 },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /groups/:id/matches", () => {
    it("lists matches for the caller's group, excluding finished by default", async () => {
      const token = await registerAndGetToken(h, "list-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const openMatch = await createMatch(h, token, groupId, { location: "Open Match" });
      const finishedMatch = await createMatch(h, token, groupId, { location: "Finished Match" });
      await h.prisma.match.update({
        where: { id: finishedMatch.json().id },
        data: { status: "finished" },
      });

      const res = await listMatches(h, token, groupId);

      expect(res.statusCode).toBe(200);
      const matches = res.json();
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe(openMatch.json().id);
    });

    it("includes finished matches when includeFinished=true", async () => {
      const token = await registerAndGetToken(h, "list-owner2@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      await createMatch(h, token, groupId, { location: "Open Match" });
      const finishedMatch = await createMatch(h, token, groupId, { location: "Finished Match" });
      await h.prisma.match.update({
        where: { id: finishedMatch.json().id },
        data: { status: "finished" },
      });

      const res = await listMatches(h, token, groupId, true);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "list-owner3@x.com");
      const otherToken = await registerAndGetToken(h, "list-other3@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team C" });
      const { id: groupId } = group.json();

      const res = await listMatches(h, otherToken, groupId);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /matches/:id", () => {
    it("returns the match when the caller owns its group", async () => {
      const token = await registerAndGetToken(h, "get-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();

      const res = await getMatch(h, token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: matchId, groupId });
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "get-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "get-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = created.json();

      const res = await getMatch(h, otherToken, matchId);

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const token = await registerAndGetToken(h, "get-unknown@x.com");

      const res = await getMatch(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });
  });

  describe("POST /matches/:id/cancel", () => {
    it("lets the owner cancel a match, setting status to cancelled", async () => {
      const token = await registerAndGetToken(h, "cancel-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();

      const res = await cancelMatch(h, token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: matchId, status: "cancelled" });
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "cancel-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "cancel-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = created.json();

      const res = await cancelMatch(h, otherToken, matchId);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /matches/:id", () => {
    it("lets the owner update location/priceCents/slots", async () => {
      const token = await registerAndGetToken(h, "update-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();

      const res = await updateMatch(h, token, matchId, {
        location: "New Place",
        priceCents: 2000,
        slots: 20,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ location: "New Place", priceCents: 2000, slots: 20 });
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "update-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "update-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = created.json();

      const res = await updateMatch(h, otherToken, matchId, { location: "New Place" });

      expect(res.statusCode).toBe(403);
    });

    it("returns 409 MTC-T0002 when updating a cancelled match", async () => {
      const token = await registerAndGetToken(h, "update-cancelled@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();
      await cancelMatch(h, token, matchId);

      const res = await updateMatch(h, token, matchId, { location: "New Place" });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0002");
    });

    it("returns 409 MTC-T0002 when updating a finished match", async () => {
      const token = await registerAndGetToken(h, "update-finished@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();
      await h.prisma.match.update({ where: { id: matchId }, data: { status: "finished" } });

      const res = await updateMatch(h, token, matchId, { location: "New Place" });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0002");
    });
  });
});
