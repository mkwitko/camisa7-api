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
    expect(body).toMatchObject({
      id: expect.any(String),
      name: "Real Rafa",
      phone: null,
      userId,
      affinity: {},
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

  // --- PATCH /players/me (FM self-declared affinity) — reuses the same app ---
  const patchAffinity = (token: string, affinity: Record<string, number>) =>
    h.app.inject({
      method: "PATCH",
      url: "/players/me",
      headers: { authorization: `Bearer ${token}` },
      payload: { affinity },
    });

  it("PATCH sets the caller's self-declared affinity (creating the player on first call)", async () => {
    const { token } = await registerAndGetToken(h, "me-patch@x.com", "Rafa");
    const res = await patchAffinity(token, { campo_atacante: 80, campo_meia: 60 });
    expect(res.statusCode).toBe(200);
    expect(res.json().affinity).toEqual({ campo_atacante: 80, campo_meia: 60 });
    const got = await getMyPlayer(h, token);
    expect(got.json().affinity).toEqual({ campo_atacante: 80, campo_meia: 60 });
  });

  it("PATCH overwrites affinity on a subsequent call", async () => {
    const { token } = await registerAndGetToken(h, "me-patch-2@x.com");
    await patchAffinity(token, { campo_atacante: 80 });
    const res = await patchAffinity(token, { campo_goleiro: 90 });
    expect(res.json().affinity).toEqual({ campo_goleiro: 90 });
  });

  it("PATCH rejects affinity out of 0-100 range", async () => {
    const { token } = await registerAndGetToken(h, "me-patch-3@x.com");
    const res = await patchAffinity(token, { campo_atacante: 150 });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH requires authentication", async () => {
    const res = await h.app.inject({ method: "PATCH", url: "/players/me", payload: { affinity: {} } });
    expect(res.statusCode).toBe(401);
  });
});
