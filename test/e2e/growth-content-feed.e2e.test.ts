import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

// `env.ts` parses (and caches) `process.env` on FIRST access — must be set
// before `buildTestApp` (which imports `@/app`, which reads `env.*` while
// building the Fastify instance) ever runs, and before any other test file
// sharing this worker has triggered that first parse. Vitest's default
// `isolate: true` (see `vitest.config.ts`) gives every e2e test FILE its own
// module registry/env cache, so this is safe alongside
// `growth-content-feed-disabled.e2e.test.ts` (which deliberately leaves it
// unset), mirroring `growth-metrics.e2e.test.ts` / `growth-metrics-
// disabled.e2e.test.ts`.
process.env.GROWTH_SERVICE_TOKEN = "test-growth-secret";

const register = (h: TestApp, email: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner" },
  });

async function token(h: TestApp, email: string): Promise<string> {
  return (await register(h, email)).json().accessToken as string;
}

const createGroup = async (h: TestApp, tok: string, name: string): Promise<string> => {
  const res = await h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${tok}` },
    payload: { name },
  });
  return res.json().id as string;
};

const createMatch = (h: TestApp, tok: string, groupId: string) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/matches`,
    headers: { authorization: `Bearer ${tok}` },
    payload: { datetime: "2999-01-01T20:00:00.000Z", location: "Quadra", slots: 10 },
  });

const contentFeed = (h: TestApp, query: string, authorization?: string) =>
  h.app.inject({
    method: "GET",
    url: `/api/growth/content-feed?${query}`,
    ...(authorization ? { headers: { authorization } } : {}),
  });

describe("GET /api/growth/content-feed", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  const from = "2026-07-16T00:00:00Z";
  const to = "2026-07-17T00:00:00Z";

  it("401s without a bearer token", async () => {
    const res = await contentFeed(h, `from=${from}&to=${to}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("GRW-T0002");
  });

  it("401s with the wrong bearer token", async () => {
    const res = await contentFeed(h, `from=${from}&to=${to}`, "Bearer wrong-secret");
    expect(res.statusCode).toBe(401);
  });

  it("200s with the content-feed shape when authorized with the configured token", async () => {
    const ownerRes = await register(h, "growth-feed-owner@x.com");
    const owner = ownerRes.json().accessToken as string;
    const ownerId = ownerRes.json().user.id as string;
    const groupId = await createGroup(h, owner, "Growth Feed FC");
    const matchRes = await createMatch(h, owner, groupId);
    const matchId = matchRes.json().id as string;

    // topMatches/totals.goals: a logged MatchStat for the match created above
    // (goals = sum of logged per-player MatchStat.goals for matches created
    // in the window), same convention as growth-metrics.e2e.test.ts.
    const player = await h.prisma.player.create({ data: { name: "Striker" } });
    await h.prisma.matchStat.create({
      data: { matchId, playerId: player.id, goals: 3 },
    });
    // topMatches.city comes from `Match.city` (not related to hotCity below,
    // which is keyed off `User.lastCity`).
    await h.prisma.match.update({ where: { id: matchId }, data: { city: "Curitiba" } });

    // hotCity: reuses the metrics endpoint's per-city User.lastCity growth —
    // 1 new user in "São Paulo" this window vs 0 in the immediately-preceding
    // window -> growthPct = 100 (the zero-previous-window fallback, same as
    // growth-metrics.e2e.test.ts).
    await h.prisma.user.update({ where: { id: ownerId }, data: { lastCity: "São Paulo" } });

    // Wide window guaranteed to cover "now" (when the rows above were created).
    const wideFrom = new Date(Date.now() - 60_000);
    const wideTo = new Date(Date.now() + 60_000);

    const res = await contentFeed(
      h,
      `from=${wideFrom.toISOString()}&to=${wideTo.toISOString()}`,
      "Bearer test-growth-secret",
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.range).toEqual({ from: wideFrom.toISOString(), to: wideTo.toISOString() });
    expect(typeof body.totals.matches).toBe("number");
    expect(body.totals).toEqual({ matches: 1, goals: 3, newGroups: 1, newUsers: 1 });

    expect(Array.isArray(body.topMatches)).toBe(true);
    expect(body.topMatches).toEqual([
      { id: matchId, city: "Curitiba", goals: 3, groupName: "Growth Feed FC" },
    ]);

    expect(Array.isArray(body.milestones)).toBe(true);

    expect(body.hotCity).toEqual({ name: "São Paulo", growthPct: 100 });
  });

  it("200s with empty collections and zero totals outside the window", async () => {
    const owner = await token(h, "growth-feed-owner-2@x.com");
    const groupId = await createGroup(h, owner, "Growth Feed FC 2");
    await createMatch(h, owner, groupId);

    // A window far in the past — none of the rows just created fall inside it.
    const res = await contentFeed(h, `from=${from}&to=${to}`, "Bearer test-growth-secret");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals).toEqual({ matches: 0, goals: 0, newGroups: 0, newUsers: 0 });
    expect(body.topMatches).toEqual([]);
    expect(body.milestones).toEqual([]);
    expect(body.hotCity).toBeNull();
  });
});
