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

const finalizeMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/finalize`,
    headers: { authorization: `Bearer ${token}` },
  });

async function confirmPresence(
  h: TestApp,
  token: string,
  matchId: string,
): Promise<{ attendanceId: string; playerId: string }> {
  const res = await h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });
  const body = res.json();
  return { attendanceId: body.id as string, playerId: body.player.id as string };
}

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

const logStats = (h: TestApp, token: string, matchId: string, stats: Record<string, unknown>[]) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/stats`,
    headers: { authorization: `Bearer ${token}` },
    payload: { stats },
  });

const castVote = (
  h: TestApp,
  token: string,
  matchId: string,
  body: { category: string; votedPlayerId: string },
) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/votes`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const getCareer = (h: TestApp, token: string, playerId: string) =>
  h.app.inject({
    method: "GET",
    url: `/players/${playerId}/career`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("finalize-match e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "Vote", "MatchStat", "MatchResult", "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  /** Wires a full finalizable match: owner + 2 confirmed players, finished, result recorded, stats logged, one MVP vote. Returns everything a test needs to finalize + inspect careers. */
  async function seedFinalizableMatch() {
    const owner = await registerAndGetToken(h, `owner-${crypto.randomUUID()}@x.com`);
    const group = await createGroup(h, owner.token, { name: "Team A" });
    const { id: groupId } = group.json();
    const created = await createMatch(h, owner.token, groupId);
    const { id: matchId } = created.json();

    const p1 = await registerAndGetToken(h, `p1-${crypto.randomUUID()}@x.com`, "Player One");
    const p2 = await registerAndGetToken(h, `p2-${crypto.randomUUID()}@x.com`, "Player Two");
    const a1 = await confirmPresence(h, p1.token, matchId);
    const a2 = await confirmPresence(h, p2.token, matchId);

    // Seeds p1's group rating so the career-growth engine bootstraps from a
    // known value (60) instead of the neutral default (50) — makes the
    // resulting `overall` deterministic and easy to assert on.
    const membersRepo = createMembersRepository(h.prisma);
    const p1Member = await membersRepo.addForUser(groupId, p1.userId, "jogador");
    await membersRepo.updateRating(p1Member.id, {
      primaryPos: "atacante",
      seedOverall: { atacante: 60 },
    });

    await finishMatch(h, owner.token, matchId);
    await recordResult(h, owner.token, matchId, {
      scores: [
        { team: 0, goals: 2 },
        { team: 1, goals: 1 },
      ],
    });
    await logStats(h, owner.token, matchId, [
      { playerId: a1.playerId, team: 0, goals: 2, assists: 0, ownGoals: 0, cleanSheet: false },
      { playerId: a2.playerId, team: 1, goals: 0, assists: 0, ownGoals: 0, cleanSheet: false },
    ]);
    await castVote(h, p2.token, matchId, { category: "mvp", votedPlayerId: a1.playerId });

    return {
      owner,
      group: { id: groupId },
      matchId,
      p1: { ...p1, playerId: a1.playerId },
      p2: { ...p2, playerId: a2.playerId },
    };
  }

  describe("POST /matches/:id/finalize", () => {
    it("lets the owner finalize a finished+resulted match, closing it and recomputing participants' careers", async () => {
      const { owner, matchId, p1, p2 } = await seedFinalizableMatch();

      const res = await finalizeMatch(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("closed");

      const p1Career = await getCareer(h, owner.token, p1.playerId);
      expect(p1Career.statusCode).toBe(200);
      const p1Body = p1Career.json();
      expect(p1Body.matchesPlayed).toBe(1);
      expect(p1Body.wins).toBe(1);
      expect(p1Body.goals).toBe(2);
      expect(p1Body.mvpCount).toBe(1);
      // win(6) + 2 goals(3 each = 6) = raw signal 12, bounded to the +3 step cap: 60 -> 63.
      expect(p1Body.overall.atacante).toBe(63);
      expect(p1Body.level).toBe("bronze");

      const p2Career = await getCareer(h, owner.token, p2.playerId);
      const p2Body = p2Career.json();
      expect(p2Body.matchesPlayed).toBe(1);
      expect(p2Body.losses).toBe(1);
      // loss(-6) bounded to the -3 step cap, bootstrapped from the neutral default (50): 50 -> 47.
      expect(p2Body.overall.meia).toBe(47);
    });

    it("is idempotent — re-finalizing an already-closed match recomputes to the exact same career values", async () => {
      const { owner, matchId, p1 } = await seedFinalizableMatch();
      await finalizeMatch(h, owner.token, matchId);
      const first = await getCareer(h, owner.token, p1.playerId);

      const second = await finalizeMatch(h, owner.token, matchId);
      const secondCareer = await getCareer(h, owner.token, p1.playerId);

      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe("closed");
      // `updatedAt` legitimately bumps on every recompute (Prisma's
      // `@updatedAt`, even when nothing else changed) — every OTHER field
      // must be byte-for-byte identical, which is the actual idempotency
      // guarantee under test here.
      const { updatedAt: _firstUpdatedAt, ...firstRest } = first.json();
      const { updatedAt: _secondUpdatedAt, ...secondRest } = secondCareer.json();
      expect(secondRest).toEqual(firstRest);
    });

    it("returns 409 MTC-T0004 when the match hasn't been finished yet", async () => {
      const owner = await registerAndGetToken(h, "owner-notfinished@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { id: matchId } = created.json();

      const res = await finalizeMatch(h, owner.token, matchId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0004");
    });

    it("returns 404 RES-T0002 when the match is finished but no result has been recorded", async () => {
      const owner = await registerAndGetToken(h, "owner-noresult@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { id: matchId } = created.json();
      await finishMatch(h, owner.token, matchId);

      const res = await finalizeMatch(h, owner.token, matchId);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("RES-T0002");
    });

    it("rejects a non-owner with 403 GRP-T0002", async () => {
      const { matchId } = await seedFinalizableMatch();
      const outsider = await registerAndGetToken(h, "outsider-finalize@x.com");

      const res = await finalizeMatch(h, outsider.token, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const owner = await registerAndGetToken(h, "owner-finalize-404@x.com");

      const res = await finalizeMatch(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });
  });
});
