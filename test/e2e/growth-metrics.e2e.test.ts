import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

// `env.ts` parses (and caches) `process.env` on FIRST access — must be set
// before `buildTestApp` (which imports `@/app`, which reads `env.*` while
// building the Fastify instance) ever runs, and before any other test file
// sharing this worker has triggered that first parse. Vitest's default
// `isolate: true` (see `vitest.config.ts`) gives every e2e test FILE its own
// module registry/env cache, so this is safe alongside
// `growth-metrics-disabled.e2e.test.ts` (which deliberately leaves it unset).
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

const metrics = (h: TestApp, query: string, authorization?: string) =>
  h.app.inject({
    method: "GET",
    url: `/api/growth/metrics?${query}`,
    ...(authorization ? { headers: { authorization } } : {}),
  });

describe("GET /api/growth/metrics", () => {
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
    const res = await metrics(h, `from=${from}&to=${to}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("GRW-T0002");
  });

  it("401s with the wrong bearer token", async () => {
    const res = await metrics(h, `from=${from}&to=${to}`, "Bearer wrong-secret");
    expect(res.statusCode).toBe(401);
  });

  it("200s with aggregated counts when authorized with the configured token", async () => {
    const ownerRes = await register(h, "growth-owner@x.com");
    const owner = ownerRes.json().accessToken as string;
    const ownerId = ownerRes.json().user.id as string;
    const groupId = await createGroup(h, owner, "Growth FC");
    const matchRes = await createMatch(h, owner, groupId);
    const matchId = matchRes.json().id as string;

    // Wide window guaranteed to cover "now" (when the rows above were created).
    const wideFrom = new Date(Date.now() - 60_000);
    const wideTo = new Date(Date.now() + 60_000);
    // Previous equal-length window, immediately preceding `wideFrom` — the
    // baseline the endpoint's per-city growthPct is computed against.
    const windowMs = wideTo.getTime() - wideFrom.getTime();
    const prevFrom = new Date(wideFrom.getTime() - windowMs);

    // goals: a logged MatchStat for the match created above (goals = sum of
    // logged per-player MatchStat.goals for matches created in the window).
    const player = await h.prisma.player.create({ data: { name: "Striker", slug: "striker-test" } });
    await h.prisma.matchStat.create({
      data: { matchId, playerId: player.id, goals: 3 },
    });

    // cities: 2 new users in "São Paulo" inside the current window (the
    // owner registered above + one seeded directly) vs. 1 in the
    // immediately-preceding window -> growthPct = (2-1)/1*100 = 100.
    await h.prisma.user.update({ where: { id: ownerId }, data: { lastCity: "São Paulo" } });
    await h.prisma.user.create({
      data: { email: "growth-sp-2@x.com", name: "SP User 2", lastCity: "São Paulo" },
    });
    await h.prisma.user.create({
      data: {
        email: "growth-sp-prev@x.com",
        name: "SP User Prev",
        lastCity: "São Paulo",
        createdAt: new Date(prevFrom.getTime() + 10_000),
      },
    });

    const res = await metrics(
      h,
      `from=${wideFrom.toISOString()}&to=${wideTo.toISOString()}`,
      "Bearer test-growth-secret",
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      matches: 1,
      goals: 3,
      newGroups: 1,
      newUsers: 2,
      cities: [{ name: "São Paulo", growthPct: 100 }],
    });
  });

  it("200s with zero counts outside the window", async () => {
    const owner = await token(h, "growth-owner-2@x.com");
    const groupId = await createGroup(h, owner, "Growth FC 2");
    await createMatch(h, owner, groupId);

    // A window far in the past — none of the rows just created fall inside it.
    const res = await metrics(h, `from=${from}&to=${to}`, "Bearer test-growth-secret");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      matches: 0,
      goals: 0,
      newGroups: 0,
      newUsers: 0,
      cities: [],
    });
  });
});
