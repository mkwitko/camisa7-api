import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name = "Owner") =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

async function registerAndGetToken(h: TestApp, email: string, name = "Owner"): Promise<string> {
  const res = await register(h, email, name);
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
      pixKey: "owner@pix.com",
      ...body,
    },
  });

const addMember = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const createInvite = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/invite`,
    headers: { authorization: `Bearer ${token}` },
  });

// No `authorization` header on purpose — these two routes must work for an
// anonymous guest (NO app, NO account), per Task 9's brief.
const resolveInvite = (h: TestApp, token: string) =>
  h.app.inject({ method: "GET", url: `/invite/${token}` });

const publicConfirm = (h: TestApp, body: { token: string; name: string; phone?: string }) =>
  h.app.inject({ method: "POST", url: "/invite/confirm", payload: body });

describe("invites e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "InviteToken", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /matches/:id/invite", () => {
    it("lets the group owner mint an invite token for their match", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-invite@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = match.json();

      const res = await createInvite(h, ownerToken, matchId);

      expect(res.statusCode).toBe(201);
      expect(typeof res.json().token).toBe("string");
      expect(res.json().token.length).toBeGreaterThan(0);
    });

    it("reuses the same active token across repeated calls instead of minting a new one", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-invite-reuse@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = match.json();

      const first = await createInvite(h, ownerToken, matchId);
      const second = await createInvite(h, ownerToken, matchId);

      expect(second.json().token).toBe(first.json().token);
    });

    it("rejects a non-owner authenticated user with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-invite-403@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = match.json();
      const outsiderToken = await registerAndGetToken(h, "outsider-invite@x.com");

      const res = await createInvite(h, outsiderToken, matchId);

      expect(res.statusCode).toBe(403);
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/matches/00000000-0000-0000-0000-000000000000/invite",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /invite/:token", () => {
    it("resolves the match core + group name + counts for an anonymous guest (no auth header)", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-resolve@x.com");
      const group = await createGroup(h, ownerToken, { name: "Galera do Bairro" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2, pixKey: "pix-key-xyz" });
      const { id: matchId } = match.json();
      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();

      const res = await resolveInvite(h, token);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        matchId,
        groupName: "Galera do Bairro",
        location: "Quadra Central",
        priceCents: 0,
        slots: 2,
        pixKey: "pix-key-xyz",
        status: "open",
        confirmedCount: 0,
        waitlistCount: 0,
      });
    });

    it("counts confirmed and waitlisted attendees correctly", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-resolve-counts@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();
      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();

      await publicConfirm(h, { token, name: "Guest One" });
      await publicConfirm(h, { token, name: "Guest Two" });
      await publicConfirm(h, { token, name: "Guest Three" });

      const res = await resolveInvite(h, token);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ confirmedCount: 2, waitlistCount: 1 });
    });

    it("NEVER leaks member ratings (seedOverall/affinity) in the response", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-no-leak@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      // A rated member with seedOverall/affinity set on the group — this is
      // the data resolve-invite must NEVER expose to an anonymous guest.
      await addMember(h, ownerToken, groupId, {
        name: "Rated Player",
        primaryPos: "atacante",
        seedOverall: { atacante: 87 },
        affinity: { campo_atacante: 5 },
      });
      const match = await createMatch(h, ownerToken, groupId);
      const { id: matchId } = match.json();
      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();

      const res = await resolveInvite(h, token);

      expect(res.statusCode).toBe(200);
      const raw = JSON.stringify(res.json());
      expect(raw).not.toMatch(/seedOverall/);
      expect(raw).not.toMatch(/affinity/);
      // Also assert the response has ONLY the fields resolve-invite's schema
      // declares — no stray `primaryPos`/rating-shaped keys snuck in.
      expect(Object.keys(res.json()).sort()).toEqual(
        [
          "confirmedCount",
          "datetime",
          "groupName",
          "location",
          "matchId",
          "pixKey",
          "priceCents",
          "slots",
          "status",
          "waitlistCount",
        ].sort(),
      );
    });

    it("returns 404 INV-T0001 for an unknown token", async () => {
      const res = await resolveInvite(h, "nonexistent-token-1234");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("INV-T0001");
    });
  });

  describe("POST /invite/confirm", () => {
    it("lets an anonymous guest (no auth header) confirm presence via the invite token", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-confirm@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();

      const res = await publicConfirm(h, { token, name: "Guest Player", phone: "11999999999" });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ status: "confirmed", waitlistPos: null });
    });

    it("waitlists once slots are full", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-confirm-wl@x.com");
      const group = await createGroup(h, ownerToken);
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();
      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();

      await publicConfirm(h, { token, name: "Guest One" });
      await publicConfirm(h, { token, name: "Guest Two" });
      const res = await publicConfirm(h, { token, name: "Guest Three" });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ status: "waitlisted", waitlistPos: 1 });
    });

    it("returns 404 INV-T0001 for an unknown token", async () => {
      const res = await publicConfirm(h, { token: "nonexistent-token-1234", name: "Guest" });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("INV-T0001");
    });
  });
});
