import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import type { FakePushGateway } from "../mocks/gateways.fake";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name = "Player") =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

async function registerAndGetToken(h: TestApp, email: string, name = "Player"): Promise<string> {
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
      ...body,
    },
  });

const confirmPresence = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });

const listAttendance = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });

const cancelPresence = (h: TestApp, token: string, matchId: string, attendanceId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance/${attendanceId}/cancel`,
    headers: { authorization: `Bearer ${token}` },
  });

const getMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const markPaid = (h: TestApp, token: string, matchId: string, attendanceId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance/${attendanceId}/mark-paid`,
    headers: { authorization: `Bearer ${token}` },
  });

const setPushToken = (h: TestApp, token: string, expoPushToken: string | null) =>
  h.app.inject({
    method: "PATCH",
    url: "/auth/me/push-token",
    headers: { authorization: `Bearer ${token}` },
    payload: { expoPushToken },
  });

const createInvite = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/invite`,
    headers: { authorization: `Bearer ${token}` },
  });

// No `authorization` header on purpose — the guest confirm route works for
// an anonymous guest (NO app, NO account), per Task 9's brief.
const publicConfirm = (h: TestApp, body: { token: string; name: string; phone?: string }) =>
  h.app.inject({ method: "POST", url: "/invite/confirm", payload: body });

const confirmPayment = (
  h: TestApp,
  token: string,
  matchId: string,
  attendanceId: string,
  body?: { paid: boolean },
) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance/${attendanceId}/confirm-payment`,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });

describe("attendance e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Attendance", "Match", "Player", "Group", "User" CASCADE',
    );
    (h.gateways.push as FakePushGateway).calls.length = 0;
  });

  describe("POST /matches/:id/attendance", () => {
    it("confirms the caller's own presence, returning 201 with status confirmed", async () => {
      const ownerToken = await registerAndGetToken(h, "owner@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();

      const playerToken = await registerAndGetToken(h, "player1@x.com", "Player One");

      const res = await confirmPresence(h, playerToken, matchId);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        matchId,
        status: "confirmed",
        waitlistPos: null,
        paymentStatus: "pending",
        paidConfirmedById: null,
      });
      expect(res.json().player).toMatchObject({ name: "Player One" });
    });

    it("rejects a request with no bearer token with 401", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/matches/00000000-0000-0000-0000-000000000000/attendance",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const token = await registerAndGetToken(h, "unknown-match@x.com");

      const res = await confirmPresence(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });

    it("returns 409 ATT-T0001 on a duplicate confirm from the same caller", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-dup@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-dup@x.com");
      await confirmPresence(h, playerToken, matchId);

      const res = await confirmPresence(h, playerToken, matchId);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("ATT-T0001");
    });

    it("waitlists once slots are full and flips the match to status full", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-full@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();

      const p1Token = await registerAndGetToken(h, "p1-full@x.com", "P1");
      const p2Token = await registerAndGetToken(h, "p2-full@x.com", "P2");
      const p3Token = await registerAndGetToken(h, "p3-full@x.com", "P3");

      const r1 = await confirmPresence(h, p1Token, matchId);
      expect(r1.json().status).toBe("confirmed");

      const r2 = await confirmPresence(h, p2Token, matchId);
      expect(r2.json().status).toBe("confirmed");

      const matchAfterFill = await getMatch(h, ownerToken, matchId);
      expect(matchAfterFill.json().status).toBe("full");

      const r3 = await confirmPresence(h, p3Token, matchId);
      expect(r3.statusCode).toBe(201);
      expect(r3.json()).toMatchObject({ status: "waitlisted", waitlistPos: 1 });
    });
  });

  describe("GET /matches/:id/attendance", () => {
    it("lists every attendance for the match", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-list@x.com");
      await confirmPresence(h, playerToken, matchId);

      const res = await listAttendance(h, ownerToken, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0]).toMatchObject({ matchId, status: "confirmed" });
    });

    it("allows a member of the group (not the owner) to view the roster", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list-member@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();

      const memberRegister = await register(h, "member-list@x.com", "Member");
      const memberToken = memberRegister.json().accessToken as string;
      const memberUserId = memberRegister.json().user.id as string;
      await createMembersRepository(h.prisma).addForUser(groupId, memberUserId, "jogador");

      const res = await listAttendance(h, memberToken, matchId);

      expect(res.statusCode).toBe(200);
    });

    it("rejects an unrelated authenticated user (not owner, not a member) with 403 ATT-T0003", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list-unrelated@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-list-unrelated@x.com");
      await confirmPresence(h, playerToken, matchId);

      const outsiderToken = await registerAndGetToken(h, "outsider-list@x.com");

      const res = await listAttendance(h, outsiderToken, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("ATT-T0003");
    });
  });

  describe("POST /matches/:id/attendance/:attId/cancel", () => {
    it("allows a player to cancel their own attendance", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-self-cancel@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-self-cancel@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const res = await cancelPresence(h, playerToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json().cancelled).toMatchObject({ id: a1.json().id, status: "cancelled" });
    });

    it("allows the group owner to cancel another player's attendance", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-cancel-other@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-cancel-other@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const res = await cancelPresence(h, ownerToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json().cancelled).toMatchObject({ id: a1.json().id, status: "cancelled" });
    });

    it("rejects an unrelated authenticated user cancelling someone else's attendance with 403 ATT-T0003", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-cancel-unrelated@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-cancel-unrelated@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const outsiderToken = await registerAndGetToken(h, "outsider-cancel@x.com");

      const res = await cancelPresence(h, outsiderToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("ATT-T0003");
    });
    it("cancels a confirmed attendee and auto-promotes the lowest waitlisted attendee", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-promote@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();

      const p1Token = await registerAndGetToken(h, "p1-promote@x.com", "P1");
      const p2Token = await registerAndGetToken(h, "p2-promote@x.com", "P2");
      const p3Token = await registerAndGetToken(h, "p3-promote@x.com", "P3");

      const a1 = await confirmPresence(h, p1Token, matchId);
      await confirmPresence(h, p2Token, matchId); // fills → full
      const a3 = await confirmPresence(h, p3Token, matchId); // waitlisted pos 1
      expect(a3.json().status).toBe("waitlisted");

      const res = await cancelPresence(h, p1Token, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.cancelled).toMatchObject({ id: a1.json().id, status: "cancelled" });
      expect(body.promoted).toMatchObject({
        id: a3.json().id,
        status: "confirmed",
        waitlistPos: null,
      });
      expect(body.promoted.player.name).toBe("P3");
    });

    it("sends exactly one push notification when the promoted player has a registered push token", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-push@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();

      const p1Token = await registerAndGetToken(h, "p1-push@x.com", "P1");
      const p2Token = await registerAndGetToken(h, "p2-push@x.com", "P2");
      const p3Token = await registerAndGetToken(h, "p3-push@x.com", "P3");
      const pushTokenRes = await setPushToken(h, p3Token, "ExponentPushToken[p3-token]");
      expect(pushTokenRes.statusCode).toBe(200);

      const a1 = await confirmPresence(h, p1Token, matchId);
      await confirmPresence(h, p2Token, matchId); // fills → full
      const a3 = await confirmPresence(h, p3Token, matchId); // waitlisted pos 1
      expect(a3.json().status).toBe("waitlisted");

      const res = await cancelPresence(h, p1Token, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json().promoted).toMatchObject({ id: a3.json().id, status: "confirmed" });

      const pushCalls = (h.gateways.push as FakePushGateway).calls;
      expect(pushCalls).toHaveLength(1);
      expect(pushCalls[0]).toMatchObject({
        to: "ExponentPushToken[p3-token]",
        title: "Pelada",
        body: "Você subiu da fila!",
      });
    });

    it("sends no push notification when the promoted attendee is a guest (no linked user)", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-push-guest@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();

      const p1Token = await registerAndGetToken(h, "p1-push-guest@x.com", "P1");
      const p2Token = await registerAndGetToken(h, "p2-push-guest@x.com", "P2");

      const a1 = await confirmPresence(h, p1Token, matchId);
      await confirmPresence(h, p2Token, matchId); // fills → full

      const invite = await createInvite(h, ownerToken, matchId);
      const { token } = invite.json();
      const guest = await publicConfirm(h, { token, name: "Guest Waitlisted" });
      expect(guest.json().status).toBe("waitlisted");

      const res = await cancelPresence(h, p1Token, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json().promoted).toMatchObject({ status: "confirmed" });
      expect(res.json().promoted.player.userId).toBeNull();

      expect((h.gateways.push as FakePushGateway).calls).toHaveLength(0);
    });

    it("returns promoted:null and reopens the match when no one is waitlisted", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-reopen@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();
      const p1Token = await registerAndGetToken(h, "p1-reopen@x.com");
      const p2Token = await registerAndGetToken(h, "p2-reopen@x.com");
      const a1 = await confirmPresence(h, p1Token, matchId);
      await confirmPresence(h, p2Token, matchId);
      expect((await getMatch(h, ownerToken, matchId)).json().status).toBe("full");

      const res = await cancelPresence(h, p1Token, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json().promoted).toBeNull();
      expect((await getMatch(h, ownerToken, matchId)).json().status).toBe("open");
    });

    it("returns 404 ATT-T0002 for an unknown attendance id", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-unknown-att@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 2 });
      const { id: matchId } = match.json();

      const res = await cancelPresence(
        h,
        ownerToken,
        matchId,
        "00000000-0000-0000-0000-000000000000",
      );

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("ATT-T0002");
    });
  });

  describe("POST /matches/:id/attendance/:attId/mark-paid", () => {
    it("allows the attendee to self-declare their own attendance as paid", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-mark-self@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-mark-self@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const res = await markPaid(h, playerToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ paymentStatus: "paid", paidConfirmedById: null });
    });

    it("allows the group owner to mark another player's attendance as paid", async () => {
      const ownerRegister = await register(h, "owner-mark-other@x.com", "Owner");
      const ownerToken = ownerRegister.json().accessToken as string;
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-mark-other@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const res = await markPaid(h, ownerToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ paymentStatus: "paid", paidConfirmedById: null });
    });

    it("rejects an unrelated authenticated user (not owner, not self) with 403 ATT-T0003", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-mark-unrelated@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-mark-unrelated@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const outsiderToken = await registerAndGetToken(h, "outsider-mark@x.com");

      const res = await markPaid(h, outsiderToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("ATT-T0003");
    });
  });

  describe("POST /matches/:id/attendance/:attId/confirm-payment", () => {
    it("lets the group owner confirm payment, setting paidConfirmedById to the owner's userId", async () => {
      const ownerRegister = await register(h, "owner-confirm-pay@x.com", "Owner");
      const ownerToken = ownerRegister.json().accessToken as string;
      const ownerUserId = ownerRegister.json().user.id as string;
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-confirm-pay@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const res = await confirmPayment(h, ownerToken, matchId, a1.json().id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ paymentStatus: "paid", paidConfirmedById: ownerUserId });
    });

    it("rejects a non-owner (including the attendee themself) with 403 — group-owner-only, same GRP-T0002 the matches CRUD uses", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-confirm-unrelated@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-confirm-unrelated@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);

      const selfRes = await confirmPayment(h, playerToken, matchId, a1.json().id);
      expect(selfRes.statusCode).toBe(403);
      expect(selfRes.json().code).toBe("GRP-T0002");

      const outsiderToken = await registerAndGetToken(h, "outsider-confirm@x.com");
      const outsiderRes = await confirmPayment(h, outsiderToken, matchId, a1.json().id);
      expect(outsiderRes.statusCode).toBe(403);
      expect(outsiderRes.json().code).toBe("GRP-T0002");
    });

    it("lets the owner toggle payment back to pending via { paid: false }", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-unconfirm-pay@x.com");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, ownerToken, groupId, { slots: 10 });
      const { id: matchId } = match.json();
      const playerToken = await registerAndGetToken(h, "player-unconfirm-pay@x.com");
      const a1 = await confirmPresence(h, playerToken, matchId);
      await confirmPayment(h, ownerToken, matchId, a1.json().id);

      const res = await confirmPayment(h, ownerToken, matchId, a1.json().id, { paid: false });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ paymentStatus: "pending", paidConfirmedById: null });
    });
  });
});
