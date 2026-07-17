import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const HOUR_MS = 60 * 60 * 1000;

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

const getVoteTally = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}/votes/tally`,
    headers: { authorization: `Bearer ${token}` },
  });

/** Sets up a finished match with `n` confirmed attendee players (beyond the owner). Returns matchId, groupId and each player's `{ token, userId, playerId }`. */
async function setupFinishedMatchWithPlayers(
  h: TestApp,
  seed: string,
  n: number,
  matchOverrides: Record<string, unknown> = {},
): Promise<{
  matchId: string;
  groupId: string;
  owner: { token: string; userId: string };
  players: { token: string; userId: string; playerId: string }[];
}> {
  const owner = await registerAndGetToken(h, `owner-${seed}@x.com`);
  const group = await createGroup(h, owner.token, { name: "Team A" });
  const { id: groupId } = group.json();
  const created = await createMatch(h, owner.token, groupId, matchOverrides);
  const { id: matchId } = created.json();

  const players: { token: string; userId: string; playerId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const p = await registerAndGetToken(h, `p${i}-${seed}@x.com`, `Player ${i}`);
    const confirmed = await confirmPresence(h, p.token, matchId);
    players.push({
      token: p.token,
      userId: p.userId,
      playerId: confirmed.json().player.id as string,
    });
  }

  await finishMatch(h, owner.token, matchId);

  return { matchId, groupId, owner, players };
}

describe("voting e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Vote", "MatchStat", "MatchResult", "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /matches/:id/votes", () => {
    it("lets a confirmed attendee cast a vote for another confirmed attendee", async () => {
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "cast", 2);
      const [p1, p2] = players;
      if (!p1 || !p2) throw new Error("expected 2 players");

      const res = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: p2.playerId,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matchId).toBe(matchId);
      expect(body.voterPlayerId).toBe(p1.playerId);
      expect(body.category).toBe("mvp");
      expect(body.votedPlayerId).toBe(p2.playerId);
      expect(body.id).toBeTypeOf("string");
    });

    it("returns 403 VOTE-T0001 when the caller is not a confirmed attendee of the match", async () => {
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "notpart", 1);
      const [p1] = players;
      if (!p1) throw new Error("expected player");

      const outsider = await registerAndGetToken(h, "outsider-notpart@x.com");

      const res = await castVote(h, outsider.token, matchId, {
        category: "mvp",
        votedPlayerId: p1.playerId,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VOTE-T0001");
    });

    it("returns 400 VOTE-T0002 when voting for a player who isn't a confirmed attendee", async () => {
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "invalidcand", 1);
      const [p1] = players;
      if (!p1) throw new Error("expected player");

      const res = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: "00000000-0000-0000-0000-000000000000",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VOTE-T0002");
    });

    it("returns 400 VOTE-T0003 for a self-vote", async () => {
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "selfvote", 1);
      const [p1] = players;
      if (!p1) throw new Error("expected player");

      const res = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: p1.playerId,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VOTE-T0003");
    });

    it("upserts instead of duplicating when the voter changes their vote within the window", async () => {
      const { matchId, owner, players } = await setupFinishedMatchWithPlayers(h, "upsert", 3);
      const [p1, p2, p3] = players;
      if (!p1 || !p2 || !p3) throw new Error("expected 3 players");

      const first = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: p2.playerId,
      });
      expect(first.statusCode).toBe(200);
      const firstId = first.json().id;

      const second = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: p3.playerId,
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(firstId); // same row, corrected
      expect(second.json().votedPlayerId).toBe(p3.playerId);

      const rows = await h.prisma.vote.findMany({ where: { matchId } });
      expect(rows).toHaveLength(1); // no duplicate row for (matchId, voterPlayerId, category)

      // Tally viewed by the owner (a plain confirmed attendee who isn't also
      // a GroupMember has no standing to view it — same owner-or-member gate
      // `list-stats`/`get-result` use).
      const tally = await getVoteTally(h, owner.token, matchId);
      const mvpTally = tally.json().find((c: { category: string }) => c.category === "mvp");
      expect(mvpTally.tally).toEqual([{ playerId: p3.playerId, votes: 1 }]);
    });

    it("returns 409 VOTE-T0004 when the match is not finished yet", async () => {
      const owner = await registerAndGetToken(h, "owner-notfinished@x.com");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, owner.token, groupId);
      const { id: matchId } = created.json();

      const p1 = await registerAndGetToken(h, "p1-notfinished@x.com");
      const confirmedP1 = await confirmPresence(h, p1.token, matchId);
      const p2 = await registerAndGetToken(h, "p2-notfinished@x.com");
      const confirmedP2 = await confirmPresence(h, p2.token, matchId);

      const res = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: confirmedP2.json().player.id,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("VOTE-T0004");
      // confirmedP1 unused beyond establishing p1 as a confirmed attendee
      expect(confirmedP1.statusCode).toBe(201);
    });

    it("returns 409 VOTE-T0004 outside the 48h post-match voting window", async () => {
      const oldDatetime = new Date(Date.now() - 72 * HOUR_MS).toISOString(); // match played 72h ago, window closed 24h ago
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "expired", 2, {
        datetime: oldDatetime,
      });
      const [p1, p2] = players;
      if (!p1 || !p2) throw new Error("expected 2 players");

      const res = await castVote(h, p1.token, matchId, {
        category: "mvp",
        votedPlayerId: p2.playerId,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("VOTE-T0004");
    });

    it("allows voting inside the 48h post-match voting window on a recently finished match", async () => {
      const recentDatetime = new Date(Date.now() - HOUR_MS).toISOString(); // 1h ago, well inside the 48h window
      const { matchId, players } = await setupFinishedMatchWithPlayers(h, "recent", 2, {
        datetime: recentDatetime,
      });
      const [p1, p2] = players;
      if (!p1 || !p2) throw new Error("expected 2 players");

      const res = await castVote(h, p1.token, matchId, {
        category: "craque",
        votedPlayerId: p2.playerId,
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /matches/:id/votes/tally", () => {
    it("aggregates counts per category/candidate and reports the leader, without exposing voter identity", async () => {
      const { matchId, owner, players } = await setupFinishedMatchWithPlayers(h, "tally", 3);
      const [p1, p2, p3] = players;
      if (!p1 || !p2 || !p3) throw new Error("expected 3 players");

      await castVote(h, p1.token, matchId, { category: "mvp", votedPlayerId: p2.playerId });
      await castVote(h, p3.token, matchId, { category: "mvp", votedPlayerId: p2.playerId });
      await castVote(h, p2.token, matchId, { category: "mvp", votedPlayerId: p1.playerId });

      // Tally viewed by the owner — a plain confirmed attendee who isn't also
      // a GroupMember has no standing to view it (same owner-or-member gate
      // `list-stats`/`get-result` use).
      const res = await getVoteTally(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        category: string;
        tally: { playerId: string; votes: number }[];
        leaderPlayerId: string | null;
      }[];

      expect(body).toHaveLength(4); // all 4 categories always present
      const categories = body.map((c) => c.category).sort();
      expect(categories).toEqual(["craque", "fair_play", "melhor_goleiro", "mvp"]);

      const mvp = body.find((c) => c.category === "mvp");
      expect(mvp?.leaderPlayerId).toBe(p2.playerId);
      expect(mvp?.tally.sort((a, b) => b.votes - a.votes)).toEqual([
        { playerId: p2.playerId, votes: 2 },
        { playerId: p1.playerId, votes: 1 },
      ]);

      const fairPlay = body.find((c) => c.category === "fair_play");
      expect(fairPlay?.tally).toEqual([]);
      expect(fairPlay?.leaderPlayerId).toBeNull();

      // Privacy: no entry anywhere in the tally response reveals who voted for whom.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("voterPlayerId");
      for (const p of [p1, p2, p3]) {
        const occurrences = serialized.match(new RegExp(p.playerId, "g"))?.length ?? 0;
        expect(occurrences).toBeLessThanOrEqual(2);
      }
    });

    it("returns an all-empty tally when no votes have been cast yet", async () => {
      const { matchId, owner } = await setupFinishedMatchWithPlayers(h, "tallyempty", 1);

      const res = await getVoteTally(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      const body = res.json() as { tally: unknown[]; leaderPlayerId: string | null }[];
      expect(body).toHaveLength(4);
      for (const category of body) {
        expect(category.tally).toEqual([]);
        expect(category.leaderPlayerId).toBeNull();
      }
    });

    it("rejects a non-member with 403 VOTE-T0005", async () => {
      const { matchId } = await setupFinishedMatchWithPlayers(h, "tally403", 1);

      const outsider = await registerAndGetToken(h, "outsider-tally403@x.com");

      const res = await getVoteTally(h, outsider.token, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("VOTE-T0005");
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const owner = await registerAndGetToken(h, "owner-tally404@x.com");

      const res = await getVoteTally(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });
  });
});
