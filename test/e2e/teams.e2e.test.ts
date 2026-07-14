import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import type { Position } from "../../src/http/api/groups/children/members/members.types";
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

/** Joins `userId` to `groupId` as a rated `jogador` member (bypassing HTTP for test setup — same pattern `attendance.e2e.test.ts` uses for its own membership fixture). */
async function addRatedMember(
  h: TestApp,
  groupId: string,
  userId: string,
  rating: { primaryPos: Position; overall: number },
) {
  const membersRepo = createMembersRepository(h.prisma);
  const member = await membersRepo.addForUser(groupId, userId, "jogador");
  await membersRepo.updateRating(member.id, {
    primaryPos: rating.primaryPos,
    seedOverall: { [rating.primaryPos]: rating.overall },
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

      const ratings: { primaryPos: Position; overall: number }[] = [
        { primaryPos: "goleiro", overall: 85 },
        { primaryPos: "goleiro", overall: 65 },
        { primaryPos: "atacante", overall: 90 },
        { primaryPos: "atacante", overall: 80 },
        { primaryPos: "zagueiro", overall: 70 },
        { primaryPos: "meia", overall: 60 },
      ];
      const goalkeeperIds: string[] = [];
      for (const [i, rating] of ratings.entries()) {
        const p = await registerAndGetToken(h, `player-gen-${i}@x.com`, `Player ${i}`);
        await addRatedMember(h, groupId, p.userId, rating);
        const confirmed = await confirmPresence(h, p.token, matchId);
        if (rating.primaryPos === "goleiro") goalkeeperIds.push(confirmed.json().player.id);
      }

      const res = await generateTeams(h, owner.token, matchId, 2);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matchId).toBe(matchId);
      expect(body.teams).toHaveLength(2);

      const allPlayers = body.teams.flatMap((t: { players: { playerId: string }[] }) => t.players);
      expect(allPlayers).toHaveLength(6);
      const sizes = body.teams.map((t: { players: unknown[] }) => t.players.length).sort();
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);

      // 2 goalkeepers, 2 teams -> round-robin spreads exactly 1 GK per team.
      const gkCountByTeam = body.teams.map(
        (t: { players: { playerId: string }[] }) =>
          t.players.filter((p) => goalkeeperIds.includes(p.playerId)).length,
      );
      expect(gkCountByTeam.sort()).toEqual([1, 1]);
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
      expect(body.teams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ team: 0, players: [{ playerId: playerId1, name: "P1" }] }),
          expect.objectContaining({ team: 1, players: [{ playerId: playerId2, name: "P2" }] }),
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
});
