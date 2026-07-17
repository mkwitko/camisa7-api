import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
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

const createGroup = async (h: TestApp, token: string, body: { name: string } = { name: "Team A" }) => {
  const res = await h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  // Geo G3: confirming presence at a PRIVATE group now requires membership, but
  // these tests confirm as non-members. Flip the freshly-created group to
  // public+open directly in the DB (a PATCH would need the `public_groups`
  // entitlement, which is off in tests) so those confirms keep working.
  if (res.statusCode === 201) {
    await h.prisma.group.update({
      where: { id: res.json().id as string },
      data: { isPublic: true, joinPolicy: "open" },
    });
  }
  return res;
};

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
      slots: 20,
      ...body,
    },
  });

const finishMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/finish`,
    headers: { authorization: `Bearer ${token}` },
  });

const confirmPresence = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });

const cancelPresence = (h: TestApp, token: string, matchId: string, attendanceId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance/${attendanceId}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });

const logStats = (h: TestApp, token: string, matchId: string, stats: Record<string, unknown>[]) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/stats`,
    headers: { authorization: `Bearer ${token}` },
    payload: { stats },
  });

const listStats = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}/stats`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("match-stats e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchStat", "MatchResult", "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /matches/:id/stats", () => {
    it("lets the owner log a stats batch on a finished match", async () => {
      const owner = await registerAndGetToken(h, "owner-log@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-log@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;

      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [
        { playerId, team: 0, goals: 2, assists: 1, ownGoals: 0, cleanSheet: false },
      ]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].playerId).toBe(playerId);
      expect(body[0].matchId).toBe(matchId);
      expect(body[0].team).toBe(0);
      expect(body[0].goals).toBe(2);
      expect(body[0].assists).toBe(1);
      expect(body[0].ownGoals).toBe(0);
      expect(body[0].cleanSheet).toBe(false);
      expect(body[0].source).toBe("organizador");
    });

    it("defaults goals/assists/ownGoals/cleanSheet when omitted", async () => {
      const owner = await registerAndGetToken(h, "owner-default@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-default@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [{ playerId }]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body[0].goals).toBe(0);
      expect(body[0].assists).toBe(0);
      expect(body[0].ownGoals).toBe(0);
      expect(body[0].cleanSheet).toBe(false);
    });

    it("re-logging the same player upserts instead of duplicating", async () => {
      const owner = await registerAndGetToken(h, "owner-upsert@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-upsert@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);

      await logStats(h, owner.token, matchId, [{ playerId, goals: 1, assists: 0 }]);
      const res = await logStats(h, owner.token, matchId, [{ playerId, goals: 3, assists: 2 }]);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].goals).toBe(3);
      expect(res.json()[0].assists).toBe(2);

      const list = await listStats(h, owner.token, matchId);
      expect(list.json()).toHaveLength(1);
      expect(list.json()[0].goals).toBe(3);
    });

    it("returns 400 STAT-T0001 for a player who never confirmed presence", async () => {
      const owner = await registerAndGetToken(h, "owner-ineligible@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [
        { playerId: "00000000-0000-0000-0000-000000000000", goals: 1 },
      ]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("STAT-T0001");
    });

    it("returns 400 STAT-T0001 for a player whose attendance was cancelled", async () => {
      const owner = await registerAndGetToken(h, "owner-cancelled@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-cancelled@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      const attendanceId = confirmed.json().id as string;
      await cancelPresence(h, p1.token, matchId, attendanceId);
      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [{ playerId, goals: 1 }]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("STAT-T0001");
    });

    it("returns 409 MTC-T0003 when the match is not finished yet", async () => {
      const owner = await registerAndGetToken(h, "owner-notfinished@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-notfinished@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;

      const res = await logStats(h, owner.token, matchId, [{ playerId, goals: 1 }]);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0003");
    });

    it("rejects a non-owner with 403 GRP-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-403@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-403@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);

      const outsider = await registerAndGetToken(h, "outsider-403@x.com");

      const res = await logStats(h, outsider.token, matchId, [{ playerId, goals: 1 }]);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });

    it("returns 400 for a negative goals count", async () => {
      const owner = await registerAndGetToken(h, "owner-negative@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-negative@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [{ playerId, goals: -1 }]);

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for an out-of-bounds goals count", async () => {
      const owner = await registerAndGetToken(h, "owner-oob@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-oob@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);

      const res = await logStats(h, owner.token, matchId, [{ playerId, goals: 51 }]);

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /matches/:id/stats", () => {
    it("returns the logged stats to the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-get@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);
      await logStats(h, owner.token, matchId, [{ playerId, goals: 2 }]);

      const res = await listStats(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].playerId).toBe(playerId);
    });

    it("returns the logged stats to a group member who isn't the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get-member@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-get-member@x.com");
      const confirmed = await confirmPresence(h, p1.token, matchId);
      const playerId = confirmed.json().player.id as string;
      await finishMatch(h, owner.token, matchId);
      await logStats(h, owner.token, matchId, [{ playerId, goals: 2 }]);

      const member = await registerAndGetToken(h, "member-get@x.com", "Member");
      const membersRepo = createMembersRepository(h.prisma);
      const createdMember = await membersRepo.addForUser(groupId, member.userId, "jogador");
      await membersRepo.updateRating(createdMember.id, {
        primaryPos: "meia",
        seedOverall: { meia: 60 },
      });

      const res = await listStats(h, member.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });

    it("returns an empty array when no stats have been logged yet", async () => {
      const owner = await registerAndGetToken(h, "owner-get-empty@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const res = await listStats(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const owner = await registerAndGetToken(h, "owner-get-mtc404@x.com");

      const res = await listStats(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });

    it("rejects a non-member with 403 STAT-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-get-403@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const outsider = await registerAndGetToken(h, "outsider-get-403@x.com");

      const res = await listStats(h, outsider.token, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("STAT-T0002");
    });
  });
});
