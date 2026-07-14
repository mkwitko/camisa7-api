import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner" },
  });

async function registerAndGetToken(h: TestApp, email: string): Promise<string> {
  const res = await register(h, email);
  return res.json().accessToken as string;
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
      slots: 10,
      ...body,
    },
  });

const finishMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/finish`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("finish-match e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "Match", "Group", "User" CASCADE');
  });

  describe("POST /matches/:id/finish", () => {
    it("lets the owner finish a match, setting status to finished", async () => {
      const token = await registerAndGetToken(h, "finish-owner@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();

      const res = await finishMatch(h, token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: matchId, status: "finished" });
    });

    it("returns 409 MTC-T0002 when finishing an already-finished match", async () => {
      const token = await registerAndGetToken(h, "finish-twice@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();
      await finishMatch(h, token, matchId);

      const res = await finishMatch(h, token, matchId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0002");
    });

    it("returns 409 MTC-T0002 when finishing a cancelled match", async () => {
      const token = await registerAndGetToken(h, "finish-cancelled@x.com");
      const group = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, token, groupId);
      const { id: matchId } = created.json();
      await h.app.inject({
        method: "POST",
        url: `/matches/${matchId}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await finishMatch(h, token, matchId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("MTC-T0002");
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "finish-owner2@x.com");
      const otherToken = await registerAndGetToken(h, "finish-other2@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = group.json();
      const created = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = created.json();

      const res = await finishMatch(h, otherToken, matchId);

      expect(res.statusCode).toBe(403);
    });
  });
});
