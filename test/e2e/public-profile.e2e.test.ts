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
): Promise<{ playerId: string }> {
  const res = await h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { playerId: res.json().player.id as string };
}

const getPublicProfile = (h: TestApp, playerId: string) =>
  h.app.inject({
    method: "GET",
    url: `/players/${playerId}/public-profile`,
  });

describe("public-profile e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "MatchStat", "MatchResult", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("GET /players/:playerId/public-profile", () => {
    it("returns 200 with the aggregate card for a registered player with a career, no PII, no auth header", async () => {
      const owner = await registerAndGetToken(h, "owner-profile@x.com", "Craque Rafa");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { id: matchId } = created.json();
      const { playerId } = await confirmPresence(h, owner.token, matchId);

      await finishMatch(h, owner.token, matchId);
      await recordResult(h, owner.token, matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
      });
      await logStats(h, owner.token, matchId, [
        { playerId, team: 0, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false },
      ]);
      await finalizeMatch(h, owner.token, matchId);

      const res = await getPublicProfile(h, playerId);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        playerId,
        name: "Craque Rafa",
        matchesPlayed: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        winRate: 1,
        goals: 1,
      });
      expect(typeof body.level).toBe("string");
      expect(typeof body.bestOverall).toBe("number");
      // NO PII ever leaks into a publicly-shareable card.
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("phone");
      expect(raw).not.toContain("email");
      expect(raw).not.toContain("userId");
      expect(body.phone).toBeUndefined();
      expect(body.email).toBeUndefined();
      expect(body.userId).toBeUndefined();
    });

    it("returns a 200 zeroed profile for a registered player with no career yet", async () => {
      const owner = await registerAndGetToken(h, "owner-profile-zero@x.com", "New Player");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { playerId } = await confirmPresence(h, owner.token, created.json().id);

      const res = await getPublicProfile(h, playerId);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        playerId,
        name: "New Player",
        level: "bronze",
        overallByPosition: {},
        bestOverall: 0,
        bestPosition: null,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        mvpCount: 0,
        currentStreak: 0,
        bestStreak: 0,
      });
    });

    it("returns 404 PLR-T0003 for a guest player (no public profile)", async () => {
      const guest = await h.prisma.player.create({
        data: { userId: null, name: "Guest Rafa", phone: "+5511999990000", slug: "guest-rafa-test" },
      });

      const res = await getPublicProfile(h, guest.id);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("PLR-T0003");
    });

    it("returns 404 PLR-T0002 for an unknown player id", async () => {
      const res = await getPublicProfile(h, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("PLR-T0002");
    });

    it("resolves by Player.slug (share-carta pretty URL) as well as by uuid", async () => {
      const owner = await registerAndGetToken(h, "owner-profile-slug@x.com", "Slug Player");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { playerId } = await confirmPresence(h, owner.token, created.json().id);
      const { slug } = await h.prisma.player.findUniqueOrThrow({ where: { id: playerId } });

      const res = await getPublicProfile(h, slug);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ playerId, name: "Slug Player" });
    });

    it("returns 404 PLR-T0002 for an unknown slug", async () => {
      const res = await getPublicProfile(h, "no-such-player-zzzz");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("PLR-T0002");
    });

    it("works with no Authorization header (public route)", async () => {
      const owner = await registerAndGetToken(h, "owner-profile-public@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { playerId } = await confirmPresence(h, owner.token, created.json().id);

      const res = await h.app.inject({
        method: "GET",
        url: `/players/${playerId}/public-profile`,
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns all-zero reputation counts for a player with no received tags", async () => {
      const owner = await registerAndGetToken(h, "owner-rep-zero@x.com", "No Tags Player");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const { playerId } = await confirmPresence(h, owner.token, created.json().id);

      const res = await getPublicProfile(h, playerId);

      expect(res.statusCode).toBe(200);
      expect(res.json().reputation).toEqual({
        pontualidade: 0,
        educacao: 0,
        compromisso: 0,
        respeito: 0,
      });
    });

    it("returns the per-dimension reputation counts for a player with received tags", async () => {
      const owner = await registerAndGetToken(h, "owner-rep-tags@x.com", "Tagged Player");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const created = await createMatch(h, owner.token, group.json().id);
      const matchId = created.json().id as string;
      const { playerId } = await confirmPresence(h, owner.token, matchId);

      const voterA = await h.prisma.player.create({
        data: { userId: null, name: "Voter A", slug: "voter-a-rep-test" },
      });
      const voterB = await h.prisma.player.create({
        data: { userId: null, name: "Voter B", slug: "voter-b-rep-test" },
      });
      await h.prisma.reputationTag.createMany({
        data: [
          {
            matchId,
            voterPlayerId: voterA.id,
            votedPlayerId: playerId,
            dimension: "pontualidade",
          },
          {
            matchId,
            voterPlayerId: voterB.id,
            votedPlayerId: playerId,
            dimension: "pontualidade",
          },
          { matchId, voterPlayerId: voterA.id, votedPlayerId: playerId, dimension: "educacao" },
        ],
      });

      const res = await getPublicProfile(h, playerId);

      expect(res.statusCode).toBe(200);
      expect(res.json().reputation).toEqual({
        pontualidade: 2,
        educacao: 1,
        compromisso: 0,
        respeito: 0,
      });
    });
  });
});
