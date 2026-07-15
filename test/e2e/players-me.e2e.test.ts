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

const getMyPlayer = (h: TestApp, token: string) =>
  h.app.inject({
    method: "GET",
    url: "/players/me",
    headers: { authorization: `Bearer ${token}` },
  });

describe("GET /players/me e2e", () => {
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

  it("returns the caller's canonical player, creating it on first call", async () => {
    const { token, userId } = await registerAndGetToken(h, "me-player@x.com", "Real Rafa");

    const res = await getMyPlayer(h, token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      id: expect.any(String),
      name: "Real Rafa",
      phone: null,
      userId,
    });

    const player = await h.prisma.player.findFirst({ where: { userId } });
    expect(player?.id).toBe(body.id);
  });

  it("returns the same player id across repeated calls (stable, not re-created)", async () => {
    const { token } = await registerAndGetToken(h, "me-player-stable@x.com");

    const first = await getMyPlayer(h, token);
    const second = await getMyPlayer(h, token);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
  });

  it("requires authentication", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/players/me",
    });

    expect(res.statusCode).toBe(401);
  });
});
