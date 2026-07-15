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

const finishMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/finish`,
    headers: { authorization: `Bearer ${token}` },
  });

const recordResult = (
  h: TestApp,
  token: string,
  matchId: string,
  body: { scores: { team: number; goals: number }[] },
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

const getCareer = (h: TestApp, token: string, playerId: string) =>
  h.app.inject({
    method: "GET",
    url: `/players/${playerId}/career`,
    headers: { authorization: `Bearer ${token}` },
  });

const claimPlayer = (h: TestApp, token: string, phone: string) =>
  h.app.inject({
    method: "POST",
    url: "/players/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { phone },
  });

describe("claim-player e2e", () => {
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

  describe("POST /players/claim", () => {
    it("merges a guest's attendance, stats, votes (both sides) and membership into the caller's canonical player, then deletes the guest", async () => {
      const owner = await registerAndGetToken(h, "owner-claim@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      // Seeds the guest directly (mirrors how `add-member`/`public-confirm`
      // would produce one, without needing the full invite-link HTTP
      // round-trip just to attach a *specific* pre-known player id to every
      // table this test needs to exercise).
      const guest = await h.prisma.player.create({
        data: { userId: null, name: "Guest Rafa", phone: "+5511999990000" },
      });

      await h.prisma.groupMember.create({
        data: {
          groupId,
          playerId: guest.id,
          role: "jogador",
          primaryPos: "atacante",
          secondaryPos: [],
          affinity: {},
          seedOverall: { atacante: 70 },
        },
      });

      await h.prisma.attendance.create({
        data: { matchId, playerId: guest.id, status: "confirmed" },
      });

      const p1 = await registerAndGetToken(h, "p1-claim@x.com", "Player One");
      const confirmedP1 = await confirmPresence(h, p1.token, matchId);

      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
      });
      await logStats(h, owner.token, matchId, [
        { playerId: guest.id, team: 0, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false },
      ]);
      // guest as VOTED (cast by a real, authenticated attendee)
      await castVote(h, p1.token, matchId, { category: "mvp", votedPlayerId: guest.id });
      // guest as VOTER — seeded directly since a guest has no account/token
      // to call `POST /matches/:id/votes` with.
      await h.prisma.vote.create({
        data: {
          matchId,
          voterPlayerId: guest.id,
          category: "craque",
          votedPlayerId: confirmedP1.playerId,
        },
      });

      const finalizeRes = await finalizeMatch(h, owner.token, matchId);
      expect(finalizeRes.statusCode).toBe(200);

      // Sanity: the guest already has a `PlayerCareer` at this point —
      // `finalize-match` recomputes for every confirmed attendee, guest or
      // not — so the merge below must actually delete it, not just leave a
      // no-op behind.
      const guestCareerBefore = await h.prisma.playerCareer.findUnique({
        where: { playerId: guest.id },
      });
      expect(guestCareerBefore).not.toBeNull();

      const claimer = await registerAndGetToken(h, "claimer-claim@x.com", "Real Rafa");

      const res = await claimPlayer(h, claimer.token, "+5511999990000");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary).toEqual({
        guestsMerged: 1,
        membershipsMerged: 1,
        attendancesMerged: 1,
        statsMerged: 1,
        votesMerged: 2,
      });
      expect(body.player.userId).toBe(claimer.userId);
      const canonicalId = body.player.id as string;

      // Guest player + its career are gone.
      expect(await h.prisma.player.findUnique({ where: { id: guest.id } })).toBeNull();
      expect(await h.prisma.playerCareer.findUnique({ where: { playerId: guest.id } })).toBeNull();

      // Attendance reassigned.
      const attendance = await h.prisma.attendance.findFirst({
        where: { matchId, playerId: canonicalId },
      });
      expect(attendance).not.toBeNull();

      // MatchStat reassigned.
      const stat = await h.prisma.matchStat.findUnique({
        where: { matchId_playerId: { matchId, playerId: canonicalId } },
      });
      expect(stat?.goals).toBe(1);

      // Vote reassigned on BOTH sides.
      const votedRow = await h.prisma.vote.findFirst({
        where: { matchId, votedPlayerId: canonicalId, category: "mvp" },
      });
      expect(votedRow).not.toBeNull();
      const voterRow = await h.prisma.vote.findFirst({
        where: { matchId, voterPlayerId: canonicalId, category: "craque" },
      });
      expect(voterRow).not.toBeNull();

      // GroupMember reassigned, rating preserved.
      const member = await h.prisma.groupMember.findUnique({
        where: { groupId_playerId: { groupId, playerId: canonicalId } },
      });
      expect(member?.seedOverall).toEqual({ atacante: 70 });

      // Career recomputed for the canonical player off the merged history.
      const careerRes = await getCareer(h, claimer.token, canonicalId);
      expect(careerRes.statusCode).toBe(200);
      expect(careerRes.json().matchesPlayed).toBe(1);
      expect(careerRes.json().goals).toBe(1);
    });

    it("resolves a GroupMember unique conflict (caller already in that group) by keeping one row and preferring the rated side, without crashing", async () => {
      const owner = await registerAndGetToken(h, "owner-conflict@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();

      const claimer = await registerAndGetToken(h, "claimer-conflict@x.com", "Real Rafa");
      const membersRepo = createMembersRepository(h.prisma);
      // Claimer's canonical player is already a member of this SAME group,
      // via the default no-rating row `addForUser` creates.
      await membersRepo.addForUser(groupId, claimer.userId, "jogador");

      const guest = await h.prisma.player.create({
        data: { userId: null, name: "Guest Rafa", phone: "+5511988880000" },
      });
      await h.prisma.groupMember.create({
        data: {
          groupId,
          playerId: guest.id,
          role: "jogador",
          primaryPos: "goleiro",
          secondaryPos: [],
          affinity: {},
          seedOverall: { goleiro: 80 },
        },
      });

      const res = await claimPlayer(h, claimer.token, "+5511988880000");

      expect(res.statusCode).toBe(200);
      expect(res.json().summary.membershipsMerged).toBe(1);
      const canonicalId = res.json().player.id as string;

      // Exactly one surviving row for the claimer's canonical player in this
      // group — `groupId`'s total also includes the group owner's own
      // (unrelated) `organizador` membership, so scope the "no duplicate"
      // check to the canonical player specifically.
      const memberships = await h.prisma.groupMember.findMany({
        where: { groupId, playerId: canonicalId },
      });
      expect(memberships).toHaveLength(1); // no crash, no duplicate — one surviving row
      expect(memberships[0]?.seedOverall).toEqual({ goleiro: 80 }); // rated side won
      expect(memberships[0]?.primaryPos).toBe("goleiro");

      expect(await h.prisma.player.findUnique({ where: { id: guest.id } })).toBeNull();
    });

    it("is a no-op (zeroed summary, still 200) when no guest matches the phone", async () => {
      const claimer = await registerAndGetToken(h, "claimer-noop@x.com");

      const res = await claimPlayer(h, claimer.token, "+5511900000000");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary).toEqual({
        guestsMerged: 0,
        membershipsMerged: 0,
        attendancesMerged: 0,
        statsMerged: 0,
        votesMerged: 0,
      });
      expect(body.player.userId).toBe(claimer.userId);
    });

    it("requires authentication", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/players/claim",
        payload: { phone: "+5511900000000" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
