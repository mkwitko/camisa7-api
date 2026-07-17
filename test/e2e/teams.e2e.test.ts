import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import type { FieldPosition } from "../../src/http/api/groups/children/members/members.types";
import { createAttendanceRepository } from "../../src/http/api/matches/children/attendance/attendance.repository";
import { createTeamsRepository } from "../../src/http/api/matches/children/teams/teams.repository";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name = "Player") =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

async function registerAndGetToken(
  h: TestApp,
  email: string,
  name = "Player",
): Promise<{ token: string; userId: string }> {
  const res = await register(h, email, name);
  return { token: res.json().accessToken as string, userId: res.json().user.id as string };
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
      slots: 20,
      ...body,
    },
  });

const confirmPresence = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/attendance`,
    headers: { authorization: `Bearer ${token}` },
  });

const generateTeams = (h: TestApp, token: string, matchId: string, teamCount?: number) =>
  h.app.inject({
    method: "POST",
    url: `/matches/${matchId}/teams${teamCount !== undefined ? `?teamCount=${teamCount}` : ""}`,
    headers: { authorization: `Bearer ${token}` },
  });

const updateTeams = (
  h: TestApp,
  token: string,
  matchId: string,
  teams: { team: number; playerIds: string[] }[],
) =>
  h.app.inject({
    method: "PUT",
    url: `/matches/${matchId}/teams`,
    headers: { authorization: `Bearer ${token}` },
    payload: { teams },
  });

const getTeams = (h: TestApp, token: string, matchId: string) =>
  h.app.inject({
    method: "GET",
    url: `/matches/${matchId}/teams`,
    headers: { authorization: `Bearer ${token}` },
  });

const addMemberHttp = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

/** Joins `userId` to `groupId` as a rated `jogador` member (bypassing HTTP for test setup — same pattern `attendance.e2e.test.ts` uses for its own membership fixture). */
async function addRatedMember(
  h: TestApp,
  groupId: string,
  userId: string,
  rating: { primaryPos: FieldPosition; overall: number },
) {
  const membersRepo = createMembersRepository(h.prisma);
  await membersRepo.addForUser(groupId, userId, "jogador");
  // FM rating: the player self-declares affinity; the balancer bootstraps the
  // effective overall from it 1:1 (up to 99) until real stats accrue. Setting
  // affinity directly is the test's stand-in for the player's self-rating.
  await h.prisma.player.updateMany({
    where: { userId },
    data: { affinity: { [rating.primaryPos]: rating.overall } },
  });
}

describe("teams e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /matches/:id/teams", () => {
    it("generates 2 balanced teams from confirmed, rated members", async () => {
      const owner = await registerAndGetToken(h, "owner-gen@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team A" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();

      const ratings: { primaryPos: FieldPosition; overall: number }[] = [
        { primaryPos: "campo_goleiro", overall: 85 },
        { primaryPos: "campo_goleiro", overall: 65 },
        { primaryPos: "campo_atacante", overall: 90 },
        { primaryPos: "campo_atacante", overall: 80 },
        { primaryPos: "campo_lateral", overall: 70 },
        { primaryPos: "campo_meia", overall: 60 },
      ];
      const goalkeeperIds: string[] = [];
      for (const [i, rating] of ratings.entries()) {
        const p = await registerAndGetToken(h, `player-gen-${i}@x.com`, `Player ${i}`);
        await addRatedMember(h, groupId, p.userId, rating);
        const confirmed = await confirmPresence(h, p.token, matchId);
        if (rating.primaryPos === "campo_goleiro") goalkeeperIds.push(confirmed.json().player.id);
      }

      const res = await generateTeams(h, owner.token, matchId, 2);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matchId).toBe(matchId);
      expect(body.teams).toHaveLength(2);

      const allPlayers = body.teams.flatMap(
        (t: { players: { playerId: string; overall: number }[] }) => t.players,
      );
      expect(allPlayers).toHaveLength(6);
      const sizes = body.teams.map((t: { players: unknown[] }) => t.players.length).sort();
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);

      // 2 goalkeepers, 2 teams -> round-robin spreads exactly 1 GK per team.
      const gkCountByTeam = body.teams.map(
        (t: { players: { playerId: string }[] }) =>
          t.players.filter((p) => goalkeeperIds.includes(p.playerId)).length,
      );
      expect(gkCountByTeam.sort()).toEqual([1, 1]);

      // Every player carries the overall the balancer used, and each team's
      // overallTotal is exactly the sum of its own players' overalls.
      const ratingByOverall = ratings.map((r) => r.overall).sort((a, b) => a - b);
      expect(
        allPlayers.map((p: { overall: number }) => p.overall).sort((a: number, b: number) => a - b),
      ).toEqual(ratingByOverall);
      for (const team of body.teams as {
        overallTotal: number;
        players: { overall: number }[];
      }[]) {
        expect(team.overallTotal).toBe(team.players.reduce((sum, p) => sum + p.overall, 0));
      }
    });

    it("defaults a confirmed guest (no GroupMember row) to overall 50, still counted in overallTotal", async () => {
      const owner = await registerAndGetToken(h, "owner-guest@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team Guest" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();

      const rated = await registerAndGetToken(h, "rated-guest@x.com", "Rated");
      await addRatedMember(h, groupId, rated.userId, { primaryPos: "campo_atacante", overall: 90 });
      await confirmPresence(h, rated.token, matchId);

      // Confirms presence without ever joining the group as a `GroupMember`
      // — the app's reported gap: guests showed up as 0 overall.
      const guest = await registerAndGetToken(h, "guest-noteam@x.com", "Guest");
      await confirmPresence(h, guest.token, matchId);

      const res = await generateTeams(h, owner.token, matchId, 2);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const allPlayers = body.teams.flatMap(
        (t: { players: { name: string; overall: number }[] }) => t.players,
      );
      const guestPlayer = allPlayers.find((p: { name: string }) => p.name === "Guest");
      expect(guestPlayer.overall).toBe(50);

      const overallTotalSum = body.teams.reduce(
        (sum: number, t: { overallTotal: number }) => sum + t.overallTotal,
        0,
      );
      expect(overallTotalSum).toBe(90 + 50);
    });

    it("treats a member added via add-member (Task 1: unrated, primaryPos null) the same as the no-GroupMember-row guest default: overall 50", async () => {
      const owner = await registerAndGetToken(h, "owner-unrated@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team Unrated" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();

      const rated = await registerAndGetToken(h, "rated-unrated@x.com", "Rated");
      await addRatedMember(h, groupId, rated.userId, { primaryPos: "campo_atacante", overall: 90 });
      await confirmPresence(h, rated.token, matchId);

      // Added via the real HTTP add-member endpoint with just a name — Task
      // 1 removed the rating fields from that body, so the resulting
      // `GroupMember` row exists (unlike the no-row guest case above) but
      // `primaryPos` is null.
      const added = await addMemberHttp(h, owner.token, groupId, { name: "Unrated Member" });
      const unratedMember = added.json();
      expect(unratedMember.primaryPos).toBeNull();

      // Confirms this guest's presence directly through the repository
      // (bypassing HTTP, same as `addRatedMember` above) since a guest
      // `Player` (userId null) has no login of its own to call
      // `POST /matches/:id/attendance` with.
      const attendanceRepo = createAttendanceRepository(h.prisma);
      await attendanceRepo.confirm(matchId, {
        ...unratedMember.player,
        id: unratedMember.player.id,
        userId: unratedMember.player.userId,
        name: unratedMember.player.name,
        phone: unratedMember.player.phone,
        affinity: unratedMember.player.affinity,
        attributes: unratedMember.player.attributes,
        skills: unratedMember.player.skills,
      });

      const res = await generateTeams(h, owner.token, matchId, 2);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const allPlayers = body.teams.flatMap(
        (t: { players: { name: string; overall: number }[] }) => t.players,
      );
      const unratedPlayer = allPlayers.find((p: { name: string }) => p.name === "Unrated Member");
      expect(unratedPlayer.overall).toBe(50);
    });

    it("rejects a non-owner with 403 GRP-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-gen-403@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team B" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-gen-403@x.com");
      const p2 = await registerAndGetToken(h, "p2-gen-403@x.com");
      await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);

      const outsider = await registerAndGetToken(h, "outsider-gen-403@x.com");

      const res = await generateTeams(h, outsider.token, matchId, 2);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });

    it("returns 409 TEAM-T0001 when fewer than 2 are confirmed", async () => {
      const owner = await registerAndGetToken(h, "owner-gen-409@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team C" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-gen-409@x.com");
      await confirmPresence(h, p1.token, matchId);

      const res = await generateTeams(h, owner.token, matchId, 2);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("TEAM-T0001");
    });
  });

  describe("PUT /matches/:id/teams", () => {
    it("persists the owner's manual override", async () => {
      const owner = await registerAndGetToken(h, "owner-put@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team D" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();

      const p1 = await registerAndGetToken(h, "p1-put@x.com", "P1");
      const p2 = await registerAndGetToken(h, "p2-put@x.com", "P2");
      const c1 = await confirmPresence(h, p1.token, matchId);
      const c2 = await confirmPresence(h, p2.token, matchId);
      const playerId1 = c1.json().player.id as string;
      const playerId2 = c2.json().player.id as string;

      const res = await updateTeams(h, owner.token, matchId, [
        { team: 0, playerIds: [playerId1] },
        { team: 1, playerIds: [playerId2] },
      ]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Neither p1 nor p2 has a `GroupMember` row here, so both default to
      // overall 50 (the same fallback `generate-teams` applies) and each
      // solo team's overallTotal is exactly that one player's overall.
      expect(body.teams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            team: 0,
            overallTotal: 50,
            players: [{ playerId: playerId1, name: "P1", overall: 50 }],
          }),
          expect.objectContaining({
            team: 1,
            overallTotal: 50,
            players: [{ playerId: playerId2, name: "P2", overall: 50 }],
          }),
        ]),
      );

      const persisted = await createTeamsRepository(h.prisma).findByMatch(matchId);
      expect(persisted).not.toBeNull();
      expect(persisted?.teams).toEqual(body.teams);
    });

    it("rejects an override missing a confirmed player with 400 TEAM-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-put-missing@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team E" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-put-missing@x.com");
      const p2 = await registerAndGetToken(h, "p2-put-missing@x.com");
      const c1 = await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);
      const playerId1 = c1.json().player.id as string;

      const res = await updateTeams(h, owner.token, matchId, [{ team: 0, playerIds: [playerId1] }]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("TEAM-T0002");
    });

    it("rejects an override with a duplicate player with 400 TEAM-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-put-dupe@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team F" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-put-dupe@x.com");
      const p2 = await registerAndGetToken(h, "p2-put-dupe@x.com");
      const c1 = await confirmPresence(h, p1.token, matchId);
      const c2 = await confirmPresence(h, p2.token, matchId);
      const playerId1 = c1.json().player.id as string;
      const playerId2 = c2.json().player.id as string;

      const res = await updateTeams(h, owner.token, matchId, [
        { team: 0, playerIds: [playerId1, playerId2] },
        { team: 1, playerIds: [playerId1] },
      ]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("TEAM-T0002");
    });

    it("rejects an override referencing an unknown playerId with 400 TEAM-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-put-unknown@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team G" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-put-unknown@x.com");
      const p2 = await registerAndGetToken(h, "p2-put-unknown@x.com");
      const c1 = await confirmPresence(h, p1.token, matchId);
      const c2 = await confirmPresence(h, p2.token, matchId);
      const playerId1 = c1.json().player.id as string;
      const playerId2 = c2.json().player.id as string;

      const res = await updateTeams(h, owner.token, matchId, [
        { team: 0, playerIds: [playerId1, "00000000-0000-0000-0000-000000000000"] },
        { team: 1, playerIds: [playerId2] },
      ]);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("TEAM-T0002");
    });

    it("rejects a non-owner with 403 GRP-T0002", async () => {
      const owner = await registerAndGetToken(h, "owner-put-403@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team H" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-put-403@x.com");
      const p2 = await registerAndGetToken(h, "p2-put-403@x.com");
      const c1 = await confirmPresence(h, p1.token, matchId);
      const c2 = await confirmPresence(h, p2.token, matchId);
      const playerId1 = c1.json().player.id as string;
      const playerId2 = c2.json().player.id as string;

      const outsider = await registerAndGetToken(h, "outsider-put-403@x.com");

      const res = await updateTeams(h, outsider.token, matchId, [
        { team: 0, playerIds: [playerId1] },
        { team: 1, playerIds: [playerId2] },
      ]);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("GRP-T0002");
    });
  });

  describe("GET /matches/:id/teams", () => {
    it("returns the persisted split to the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team I" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-get@x.com");
      const p2 = await registerAndGetToken(h, "p2-get@x.com");
      await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);
      const generated = await generateTeams(h, owner.token, matchId, 2);

      const res = await getTeams(h, owner.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(generated.json());
    });

    it("returns the persisted split to a group member who isn't the owner", async () => {
      const owner = await registerAndGetToken(h, "owner-get-member@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team J" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-get-member@x.com");
      const p2 = await registerAndGetToken(h, "p2-get-member@x.com");
      await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);
      await generateTeams(h, owner.token, matchId, 2);

      const member = await registerAndGetToken(h, "member-get@x.com", "Member");
      await addRatedMember(h, groupId, member.userId, { primaryPos: "campo_meia", overall: 60 });

      const res = await getTeams(h, member.token, matchId);

      expect(res.statusCode).toBe(200);
      expect(res.json().matchId).toBe(matchId);
    });

    it("rejects a non-member with 403 TEAM-T0004", async () => {
      const owner = await registerAndGetToken(h, "owner-get-403@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team K" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();
      const p1 = await registerAndGetToken(h, "p1-get-403@x.com");
      const p2 = await registerAndGetToken(h, "p2-get-403@x.com");
      await confirmPresence(h, p1.token, matchId);
      await confirmPresence(h, p2.token, matchId);
      await generateTeams(h, owner.token, matchId, 2);

      const outsider = await registerAndGetToken(h, "outsider-get-403@x.com");

      const res = await getTeams(h, outsider.token, matchId);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("TEAM-T0004");
    });

    it("returns 404 TEAM-T0003 when no split has been generated yet", async () => {
      const owner = await registerAndGetToken(h, "owner-get-404@x.com", "Owner");
      const group = await createGroup(h, owner.token, { name: "Team L" });
      const { id: groupId } = group.json();
      const match = await createMatch(h, owner.token, groupId);
      const { id: matchId } = match.json();

      const res = await getTeams(h, owner.token, matchId);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("TEAM-T0003");
    });

    it("returns 404 MTC-T0001 for an unknown match id", async () => {
      const owner = await registerAndGetToken(h, "owner-get-mtc404@x.com", "Owner");

      const res = await getTeams(h, owner.token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("MTC-T0001");
    });
  });
});
