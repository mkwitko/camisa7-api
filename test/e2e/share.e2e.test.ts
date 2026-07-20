import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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

const createGroup = async (
  h: TestApp,
  token: string,
  body: { name: string } = { name: "Team A" },
) => {
  const res = await h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
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

/** Registers an owner, a group, a match, finishes+records+finalizes it with
 * one goal for the confirmed player — a fully-fledged "registered player with
 * career" fixture the carta/conquista/ranking routes can all render off. */
async function seedRegisteredPlayerWithCareer(
  h: TestApp,
  email: string,
  name: string,
): Promise<{ groupId: string; playerId: string; slug: string }> {
  const owner = await registerAndGetToken(h, email, name);
  const group = await createGroup(h, owner.token, { name: "Team A" });
  const groupId = group.json().id as string;
  const created = await createMatch(h, owner.token, groupId);
  const matchId = created.json().id as string;
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

  const { slug } = await h.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  return { groupId, playerId, slug };
}

describe("share image routes (/og/*)", () => {
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

  describe("GET /og/carta/:slug.png", () => {
    it("serves a PNG for the carta with cache headers", async () => {
      const { slug } = await seedRegisteredPlayerWithCareer(h, "carta1@x.com", "Maurício");

      const res = await h.app.inject({ method: "GET", url: `/og/carta/${slug}.png` });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(res.headers["cache-control"]).toBeTruthy();
      expect(res.headers.etag).toBeTruthy();
      expect(res.rawPayload.subarray(0, 4)).toEqual(PNG_MAGIC);
    });

    it("returns 304 when If-None-Match matches", async () => {
      const { slug } = await seedRegisteredPlayerWithCareer(h, "carta2@x.com", "Maurício");

      const first = await h.app.inject({ method: "GET", url: `/og/carta/${slug}.png` });
      const etag = first.headers.etag as string;
      const res = await h.app.inject({
        method: "GET",
        url: `/og/carta/${slug}.png`,
        headers: { "if-none-match": etag },
      });

      expect(res.statusCode).toBe(304);
    });

    it("404s an unknown slug", async () => {
      const res = await h.app.inject({ method: "GET", url: "/og/carta/does-not-exist.png" });

      expect(res.statusCode).toBe(404);
    });

    it("works with no Authorization header (public route)", async () => {
      const { slug } = await seedRegisteredPlayerWithCareer(h, "carta3@x.com", "Maurício");

      const res = await h.app.inject({ method: "GET", url: `/og/carta/${slug}.png` });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /og/conquista/:slug/:key.png", () => {
    it("serves a PNG for an unlocked achievement", async () => {
      const { slug } = await seedRegisteredPlayerWithCareer(h, "conq1@x.com", "Maurício");

      const res = await h.app.inject({
        method: "GET",
        url: `/og/conquista/${slug}/primeiro_gol.png`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(res.headers.etag).toBeTruthy();
      expect(res.rawPayload.subarray(0, 4)).toEqual(PNG_MAGIC);
    });

    it("404s a locked/unknown achievement key", async () => {
      const { slug } = await seedRegisteredPlayerWithCareer(h, "conq2@x.com", "Maurício");

      const res = await h.app.inject({
        method: "GET",
        url: `/og/conquista/${slug}/nao-existe.png`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /og/ranking/:groupId/:playerId.png", () => {
    it("serves a PNG for the player's goals rank in the group", async () => {
      const { groupId, playerId } = await seedRegisteredPlayerWithCareer(
        h,
        "rank1@x.com",
        "Maurício",
      );

      const res = await h.app.inject({
        method: "GET",
        url: `/og/ranking/${groupId}/${playerId}.png`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(res.headers.etag).toBeTruthy();
      expect(res.rawPayload.subarray(0, 4)).toEqual(PNG_MAGIC);
    });

    it("404s an unknown group", async () => {
      const { playerId } = await seedRegisteredPlayerWithCareer(h, "rank2@x.com", "Maurício");

      const res = await h.app.inject({
        method: "GET",
        url: `/og/ranking/00000000-0000-0000-0000-000000000000/${playerId}.png`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("404s a player with no goals in the group's ranking", async () => {
      const { groupId } = await seedRegisteredPlayerWithCareer(h, "rank3@x.com", "Maurício");

      const res = await h.app.inject({
        method: "GET",
        url: `/og/ranking/${groupId}/00000000-0000-0000-0000-000000000000.png`,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
