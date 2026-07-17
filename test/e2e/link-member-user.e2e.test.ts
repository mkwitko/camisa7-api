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

const addMember = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members`,
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

/**
 * Task 1 (UX overhaul): `POST /groups/:id/members` no longer accepts a
 * rating — an owner sets it afterwards via this `PATCH`, same pattern
 * `members.e2e.test.ts`/`teams.e2e.test.ts` use for their own rated
 * fixtures.
 */
const patchMember = (
  h: TestApp,
  token: string,
  groupId: string,
  memberId: string,
  body: Record<string, unknown>,
) =>
  h.app.inject({
    method: "PATCH",
    url: `/groups/${groupId}/members/${memberId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const linkMemberUser = (
  h: TestApp,
  token: string,
  groupId: string,
  memberId: string,
  email: string,
) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members/${memberId}/link-user`,
    headers: { authorization: `Bearer ${token}` },
    payload: { email },
  });

describe("link-member-user e2e", () => {
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

  describe("POST /groups/:id/members/:memberId/link-user", () => {
    it("owner links a guest member to a registered user by email, merging the guest's full history into that user's player", async () => {
      const owner = await registerAndGetToken(h, "owner-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const added = await addMember(h, owner.token, groupId, {
        name: "Guest Rafa",
        phone: "+5511999990000",
      });
      await patchMember(h, owner.token, groupId, added.json().id as string, {
        primaryPos: "atacante",
        seedOverall: { atacante: 70 },
      });
      const memberBody = added.json();
      const memberId = memberBody.id as string;
      const guestPlayerId = memberBody.player.id as string;

      await h.prisma.attendance.create({
        data: { matchId, playerId: guestPlayerId, status: "confirmed" },
      });

      const p1 = await registerAndGetToken(h, "p1-link@x.com", "Player One");
      const confirmedP1 = await confirmPresence(h, p1.token, matchId);

      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
      });
      await logStats(h, owner.token, matchId, [
        { playerId: guestPlayerId, team: 0, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false },
      ]);
      // guest as VOTED (cast by a real, authenticated attendee)
      await castVote(h, p1.token, matchId, { category: "mvp", votedPlayerId: guestPlayerId });
      // guest as VOTER — seeded directly since a guest has no account/token
      // to call `POST /matches/:id/votes` with.
      await h.prisma.vote.create({
        data: {
          matchId,
          voterPlayerId: guestPlayerId,
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
        where: { playerId: guestPlayerId },
      });
      expect(guestCareerBefore).not.toBeNull();

      const target = await registerAndGetToken(h, "real-rafa@x.com", "Real Rafa");

      const res = await linkMemberUser(h, owner.token, groupId, memberId, "real-rafa@x.com");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary).toEqual({
        guestsMerged: 1,
        membershipsMerged: 1,
        attendancesMerged: 1,
        statsMerged: 1,
        votesMerged: 2,
      });
      expect(body.member.player.userId).toBe(target.userId);
      const canonicalId = body.member.player.id as string;

      // Guest player + its career are gone.
      expect(await h.prisma.player.findUnique({ where: { id: guestPlayerId } })).toBeNull();
      expect(
        await h.prisma.playerCareer.findUnique({ where: { playerId: guestPlayerId } }),
      ).toBeNull();

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

      // GroupMember reassigned, rating preserved, now linked to the target.
      const member = await h.prisma.groupMember.findUnique({
        where: { groupId_playerId: { groupId, playerId: canonicalId } },
      });
      expect(member?.seedOverall).toEqual({ atacante: 70 });

      // Career recomputed for the target's canonical player off the merged history.
      const careerRes = await getCareer(h, target.token, canonicalId);
      expect(careerRes.statusCode).toBe(200);
      expect(careerRes.json().matchesPlayed).toBe(1);
      expect(careerRes.json().goals).toBe(1);
    });

    it("resolves a GroupMember unique conflict (target already in that group) by keeping one row and preferring the rated side, without crashing", async () => {
      const owner = await registerAndGetToken(h, "owner-conflict-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();

      const target = await registerAndGetToken(h, "target-conflict-link@x.com", "Real Rafa");
      const membersRepo = createMembersRepository(h.prisma);
      // Target's canonical player is already a member of this SAME group,
      // via the default no-rating row `addForUser` creates.
      await membersRepo.addForUser(groupId, target.userId, "jogador");

      const added = await addMember(h, owner.token, groupId, {
        name: "Guest Rafa",
        phone: "+5511988880000",
      });
      const memberId = added.json().id as string;
      await patchMember(h, owner.token, groupId, memberId, {
        primaryPos: "goleiro",
        seedOverall: { goleiro: 80 },
      });

      const res = await linkMemberUser(
        h,
        owner.token,
        groupId,
        memberId,
        "target-conflict-link@x.com",
      );

      expect(res.statusCode).toBe(200);
      expect(res.json().summary.membershipsMerged).toBe(1);
      const canonicalId = res.json().member.player.id as string;

      // Exactly one surviving row for the target's canonical player in this
      // group — `groupId`'s total also includes the group owner's own
      // (unrelated) `organizador` membership, so scope the "no duplicate"
      // check to the canonical player specifically.
      const memberships = await h.prisma.groupMember.findMany({
        where: { groupId, playerId: canonicalId },
      });
      expect(memberships).toHaveLength(1); // no crash, no duplicate — one surviving row
      expect(memberships[0]?.seedOverall).toEqual({ goleiro: 80 }); // rated side won
      expect(memberships[0]?.primaryPos).toBe("goleiro");
    });

    it("rejects a non-owner with 403", async () => {
      const owner = await registerAndGetToken(h, "owner-403-link@x.com");
      const other = await registerAndGetToken(h, "other-403-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team B" });
      const { id: groupId } = group.json();
      const added = await addMember(h, owner.token, groupId, { name: "Guest Player" });
      const memberId = added.json().id as string;

      await register(h, "target-403-link@x.com");

      const res = await linkMemberUser(h, other.token, groupId, memberId, "target-403-link@x.com");

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for an email with no registered user", async () => {
      const owner = await registerAndGetToken(h, "owner-404-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team C" });
      const { id: groupId } = group.json();
      const added = await addMember(h, owner.token, groupId, { name: "Guest Player" });
      const memberId = added.json().id as string;

      const res = await linkMemberUser(h, owner.token, groupId, memberId, "no-such-user@x.com");

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when the target member is already registered (not a guest)", async () => {
      const owner = await registerAndGetToken(h, "owner-400-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team D" });
      const { id: groupId } = group.json();

      // The owner's own auto-added `organizador` membership is a REGISTERED
      // member (`player.userId` set), not a guest.
      const members = await h.app.inject({
        method: "GET",
        url: `/groups/${groupId}/members`,
        headers: { authorization: `Bearer ${owner.token}` },
      });
      const ownerMemberId = members.json()[0].id as string;

      await register(h, "target-400-link@x.com");

      const res = await linkMemberUser(
        h,
        owner.token,
        groupId,
        ownerMemberId,
        "target-400-link@x.com",
      );

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for a memberId that doesn't belong to the group", async () => {
      const owner = await registerAndGetToken(h, "owner-nomember-link@x.com");
      const group = await createGroup(h, owner.token, { name: "Team E" });
      const { id: groupId } = group.json();
      await register(h, "target-nomember-link@x.com");

      const res = await linkMemberUser(
        h,
        owner.token,
        groupId,
        "00000000-0000-0000-0000-000000000000",
        "target-nomember-link@x.com",
      );

      expect(res.statusCode).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/groups/00000000-0000-0000-0000-000000000000/members/00000000-0000-0000-0000-000000000000/link-user",
        payload: { email: "someone@x.com" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
