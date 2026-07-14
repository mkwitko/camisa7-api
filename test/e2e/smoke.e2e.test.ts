import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Position } from "@/http/api/groups/children/members/members.types";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

const createGroup = (h: TestApp, token: string, body: { name: string }) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const addMember = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const createMatch = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/matches`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const getMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const createInvite = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/invite`,
    headers: { authorization: `Bearer ${token}` },
  });

// No `authorization` header on purpose: a guest with no app, no account.
const publicConfirm = (h: TestApp, body: { token: string; name: string; phone?: string }) =>
  h.app.inject({ method: "POST", url: "/invite/confirm", payload: body });

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

const generateTeams = (h: TestApp, token: string, matchId: string, teamCount: number) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/teams?teamCount=${teamCount}`,
    headers: { authorization: `Bearer ${token}` },
  });

const finishMatch = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/finish`,
    headers: { authorization: `Bearer ${token}` },
  });

/** 9 varied-position roster members, one of them a goleiro, all rated via `seedOverall`. */
const ROSTER: { name: string; primaryPos: Position; overall: number }[] = [
  { name: "Goleiro Titular", primaryPos: "goleiro", overall: 82 },
  { name: "Zagueiro 1", primaryPos: "zagueiro", overall: 74 },
  { name: "Zagueiro 2", primaryPos: "zagueiro", overall: 68 },
  { name: "Lateral 1", primaryPos: "lateral", overall: 70 },
  { name: "Lateral 2", primaryPos: "lateral", overall: 65 },
  { name: "Volante", primaryPos: "volante", overall: 75 },
  { name: "Meia 1", primaryPos: "meia", overall: 80 },
  { name: "Meia 2", primaryPos: "meia", overall: 60 },
  { name: "Atacante", primaryPos: "atacante", overall: 88 },
];

/**
 * Full Fase 0 happy-path smoke test (Task 13, plan step 3): one test driving
 * the whole flow against the real app + a Testcontainers Postgres, touching
 * auth, groups, members, matches, invites, the public guest-confirm path,
 * waitlist auto-promotion, the team balancer, and match lifecycle in
 * sequence. This is deliberately NOT a substitute for the focused e2e suites
 * (auth/groups/members/matches/attendance/invites/teams) — it's a guard
 * against regressions in how those pieces compose end-to-end.
 */
describe("Fase 0 smoke e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "TeamAssignment", "InviteToken", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  it("runs the full organizer happy path end-to-end", async () => {
    // 1. register org
    const ownerRes = await register(h, "smoke-owner@x.com", "Organizador");
    expect(ownerRes.statusCode).toBe(201);
    const ownerToken = ownerRes.json().accessToken as string;

    // 2. create group
    const groupRes = await createGroup(h, ownerToken, { name: "Pelada de Sábado" });
    expect(groupRes.statusCode).toBe(201);
    const { id: groupId } = groupRes.json();

    // 3. add 9 members, varied positions incl. a goleiro, all with seedOverall
    for (const member of ROSTER) {
      const res = await addMember(h, ownerToken, groupId, {
        name: member.name,
        primaryPos: member.primaryPos,
        seedOverall: { [member.primaryPos]: member.overall },
      });
      expect(res.statusCode).toBe(201);
    }

    // 4. create match with 10 slots
    const matchRes = await createMatch(h, ownerToken, groupId, {
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      slots: 10,
      priceCents: 2000,
      pixKey: "owner@pix.com",
    });
    expect(matchRes.statusCode).toBe(201);
    const { id: matchId } = matchRes.json();
    expect(matchRes.json().status).toBe("open");

    // 5. create invite
    const inviteRes = await createInvite(h, ownerToken, matchId);
    expect(inviteRes.statusCode).toBe(201);
    const { token: inviteToken } = inviteRes.json();

    // 6. guests confirm via the public invite link until 10 are confirmed
    for (let i = 1; i <= 10; i++) {
      const res = await publicConfirm(h, { token: inviteToken, name: `Guest ${i}` });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ status: "confirmed", waitlistPos: null });
    }

    const matchAfterFill = await getMatch(h, ownerToken, matchId);
    expect(matchAfterFill.json().status).toBe("full");

    // 7. an 11th guest confirm -> waitlisted, position 1
    const eleventh = await publicConfirm(h, { token: inviteToken, name: "Guest 11" });
    expect(eleventh.statusCode).toBe(201);
    expect(eleventh.json()).toMatchObject({ status: "waitlisted", waitlistPos: 1 });

    // 8. cancel one confirmed attendee (owner manages the resource)
    const beforeCancel = await listAttendance(h, ownerToken, matchId);
    expect(beforeCancel.statusCode).toBe(200);
    const confirmedBeforeCancel = beforeCancel
      .json()
      .filter((a: { status: string }) => a.status === "confirmed");
    expect(confirmedBeforeCancel).toHaveLength(10);
    const toCancel = confirmedBeforeCancel[0];

    const cancelRes = await cancelPresence(h, ownerToken, matchId, toCancel.id);
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().cancelled).toMatchObject({ id: toCancel.id, status: "cancelled" });

    // 9. the 11th guest got promoted to confirmed
    expect(cancelRes.json().promoted).toMatchObject({
      id: eleventh.json().attendanceId,
      status: "confirmed",
      waitlistPos: null,
    });

    // Slot immediately refilled by the promotion -> match stays full.
    const matchAfterPromotion = await getMatch(h, ownerToken, matchId);
    expect(matchAfterPromotion.json().status).toBe("full");

    const afterCancel = await listAttendance(h, ownerToken, matchId);
    const confirmedAfterCancel = afterCancel
      .json()
      .filter((a: { status: string }) => a.status === "confirmed");
    expect(confirmedAfterCancel).toHaveLength(10);

    // 10. owner generates 2 balanced teams
    const teamsRes = await generateTeams(h, ownerToken, matchId, 2);
    expect(teamsRes.statusCode).toBe(200);
    const teamsBody = teamsRes.json();
    expect(teamsBody.matchId).toBe(matchId);
    expect(teamsBody.teams).toHaveLength(2);

    const teamPlayerIds = teamsBody.teams
      .flatMap((t: { players: { playerId: string }[] }) => t.players.map((p) => p.playerId))
      .sort();
    const confirmedPlayerIds = confirmedAfterCancel
      .map((a: { player: { id: string } }) => a.player.id)
      .sort();
    expect(teamPlayerIds).toEqual(confirmedPlayerIds);

    const sizes = teamsBody.teams.map((t: { players: unknown[] }) => t.players.length).sort();
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);

    // 11. owner finishes the match
    const finishRes = await finishMatch(h, ownerToken, matchId);
    expect(finishRes.statusCode).toBe(200);
    expect(finishRes.json()).toMatchObject({ id: matchId, status: "finished" });
  });
});
