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

const generateTeams = (h: TestApp, token: string, matchId: string, teamCount?: number) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/teams${teamCount !== undefined ? `?teamCount=${teamCount}` : ""}`,
    headers: { authorization: `Bearer ${token}` },
  });

const recordResult = (
  h: TestApp,
  token: string,
  matchId: string,
  body: { scores: { team: number; goals: number }[]; winnerTeam?: number | null },
) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/result`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const getResult = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}/result`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("match-result e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchResult", "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /matches/:id/result", () => {
    it("lets the owner record a result on a finished match, deriving the winner", async () => {
      const owner = await registerAndGetToken(h, "owner-record@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);

      const res = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matchId).toBe(matchId);
      expect(body.scores).toEqual(
        expect.arrayContaining([
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ]),
      );
      expect(body.winnerTeam).toBe(0);
      expect(body.recordedById).toBe(owner.userId);
      expect(typeof body.recordedAt).toBe("string");
    });

    it("accepts an explicit winnerTeam and a draw (null)", async () => {
      const owner = await registerAndGetToken(h, "owner-draw@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);

      const res = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 2 },
          { team: 1, goals: 2 },
        ],
        winnerTeam: null,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().winnerTeam).toBeNull();
    });

    it("upsert corrects a previously recorded result instead of creating a second one", async () => {
      const owner = await registerAndGetToken(h, "owner-correct@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
      });

      const res = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 4 },
        ],
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().winnerTeam).toBe(1);

      const get = await getResult(h, owner.token, matchId);
      expect(get.json().scores).toEqual(
        expect.arrayContaining([
          { team: 0, goals: 1 },
          { team: 1, goals: 4 },
        ]),
      );
    });

    it("validates scores against a generated TeamAssignment's team indices", async () => {
      const owner = await registerAndGetToken(h, "owner-teams@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      const p1 = await registerAndGetToken(h, "p1-teams@x.com");
      const p2 = await registerAndGetToken(h, "p2-teams@x.com");
      await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);
      await generateTeams(h, owner.token, matchId, 2);
      await finishMatch(h, owner.token, matchId);

      const res = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 2, goals: 2 },
        ],
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("RES-T0001");
    });

    it("returns 409 MTC-T0003 when the match is not finished yet", async () => {
      const owner = await registerAndGetToken(h, "owner-notfinished@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const res = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0003");
    });

    it("rejects a non-owner with 403 GRP-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-403@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);

      const outsider = await registerAndGetToken(h, "outsider-403@x.com");

      const res = await recordResult(h, outsider.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });
  });

  describe("GET /matches/:id/result", () => {
    it("returns the recorded result to the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);
      const recorded = await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
      });

      const res = await getResult(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(recorded.json());
    });

    it("returns the recorded result to a group member who isn't the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get-member@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
      });

      const member = await registerAndGetToken(h, "member-get@x.com", "Member");
      const membersRepo = createMembersRepository(h.prisma);
      const created2 = await membersRepo.addForUser(groupId, member.userId, "jogador");
      await membersRepo.updateRating(created2.id, {
        primaryPos: "meia",
        seedOverall: { meia: 60 },
      });

      const res = await getResult(h, member.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json().matchId).toBe(matchId);
    });

    it("returns 404 RES-T0002 when no result has been recorded yet", async () => {
      const owner = await registerAndGetToken(h, "owner-get-404@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const res = await getResult(h, owner.token, matchId);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("RES-T0002");
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const owner = await registerAndGetToken(h, "owner-get-mtc404@x.com");

      const res = await getResult(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });

    it("rejects a non-member with 403 RES-T0003", async () => {
      const owner = await registerAndGetToken(h, "owner-get-403@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
      });

      const outsider = await registerAndGetToken(h, "outsider-get-403@x.com");

      const res = await getResult(h, outsider.token, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("RES-T0003");
    });
  });
});
