import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name = "Owner") =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

async function registerAndGetToken(
  h: TestApp,
  email: string,
  name = "Owner",
): Promise<{ token: string; userId: string }> {
  const res = await register(h, email, name);
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
}

const createGroup = (h: TestApp, token: string, body: { name: string } = { name: "Team A" }) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const createMatch = (h: TestApp, token: string, groupId: string) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/matches`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      slots: 20,
    },
  });

async function confirmPresence(
  h: TestApp,
  token: string,
  matchId: string,
): Promise<{ playerId: string }> {
  const res = await h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { playerId: res.json().player.id as string };
}

const getCareer = (h: TestApp, token: string, playerId: string) =>
  h.app.inject({
    method: "GET",
    url: `/players/${playerId}/career`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("get-career e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("GET /players/:playerId/career", () => {
    it("returns a zeroed/bootstrap-default career for a player with no finalized match history yet", async () => {
      const owner = await registerAndGetToken(h, "owner-career-default@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { playerId } = await confirmPresence(h, owner.token, created.json().id);

      const res = await getCareer(h, owner.token, playerId);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        id: null,
        playerId,
        overall: {},
        affinity: {},
        level: "bronze",
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        mvpCount: 0,
        currentStreak: 0,
        bestStreak: 0,
        updatedAt: null,
      });
    });

    it("returns 404 PLR-T0002 for an unknown player id", async () => {
      const owner = await registerAndGetToken(h, "owner-career-404@x.com");

      const res = await getCareer(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("PLR-T0002");
    });

    it("requires authentication", async () => {
      const res = await h.app.inject({
        method: "GET",
        url: "/players/00000000-0000-0000-0000-000000000000/career",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
