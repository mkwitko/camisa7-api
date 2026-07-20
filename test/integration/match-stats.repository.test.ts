import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchStatsRepository } from "../../src/http/api/matches/children/stats/stats.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { generateSlug, randomHex4 } from "../../src/http/api/players/player-slug";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("matchStatsRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createMatchStatsRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createMatchStatsRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchStat", "Match", "Group", "Player", "User" CASCADE',
    );
  });

  async function createMatchId(): Promise<{ matchId: string }> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    const match = await matchesRepo.insert({
      groupId: group.id,
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
    });
    return { matchId: match.id };
  }

  async function createPlayerId(name = "Player"): Promise<string> {
    const player = await testDb.prisma.player.create({
      data: { name, slug: generateSlug(name, randomHex4) },
    });
    return player.id;
  }

  describe("upsertMany", () => {
    it("creates one row per player when none exist", async () => {
      const { matchId } = await createMatchId();
      const p1 = await createPlayerId("P1");
      const p2 = await createPlayerId("P2");

      const rows = await repo.upsertMany(
        matchId,
        [
          { playerId: p1, team: 0, goals: 2, assists: 1, ownGoals: 0, cleanSheet: false },
          { playerId: p2, team: 1, goals: 0, assists: 0, ownGoals: 0, cleanSheet: true },
        ],
        "organizador",
      );

      expect(rows).toHaveLength(2);
      const byPlayer = new Map(rows.map((r) => [r.playerId, r]));
      expect(byPlayer.get(p1)?.goals).toBe(2);
      expect(byPlayer.get(p1)?.assists).toBe(1);
      expect(byPlayer.get(p1)?.source).toBe("organizador");
      expect(byPlayer.get(p2)?.cleanSheet).toBe(true);
    });

    it("is idempotent on the (matchId, playerId) unique constraint — re-upserting corrects the row", async () => {
      const { matchId } = await createMatchId();
      const p1 = await createPlayerId("P1");

      const first = await repo.upsertMany(
        matchId,
        [{ playerId: p1, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false }],
        "organizador",
      );

      const corrected = await repo.upsertMany(
        matchId,
        [{ playerId: p1, team: 1, goals: 4, assists: 2, ownGoals: 1, cleanSheet: true }],
        "organizador",
      );

      expect(corrected).toHaveLength(1);
      expect(corrected[0]?.id).toBe(first[0]?.id);
      expect(corrected[0]?.goals).toBe(4);
      expect(corrected[0]?.team).toBe(1);
      expect(corrected[0]?.cleanSheet).toBe(true);

      const rows = await testDb.prisma.matchStat.findMany({ where: { matchId, playerId: p1 } });
      expect(rows).toHaveLength(1);
    });
  });

  describe("listByMatch", () => {
    it("returns every stat row logged for a match", async () => {
      const { matchId } = await createMatchId();
      const p1 = await createPlayerId("P1");
      const p2 = await createPlayerId("P2");
      await repo.upsertMany(
        matchId,
        [
          { playerId: p1, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false },
          { playerId: p2, goals: 0, assists: 1, ownGoals: 0, cleanSheet: false },
        ],
        "organizador",
      );

      const rows = await repo.listByMatch(matchId);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.playerId).sort()).toEqual([p1, p2].sort());
    });

    it("returns an empty array when nothing has been logged", async () => {
      const { matchId } = await createMatchId();

      expect(await repo.listByMatch(matchId)).toEqual([]);
    });
  });

  describe("listByPlayer", () => {
    it("returns a player's stat rows across every match", async () => {
      const { matchId: matchId1 } = await createMatchId();
      const { matchId: matchId2 } = await createMatchId();
      const p1 = await createPlayerId("P1");

      await repo.upsertMany(
        matchId1,
        [{ playerId: p1, goals: 1, assists: 0, ownGoals: 0, cleanSheet: false }],
        "organizador",
      );
      await repo.upsertMany(
        matchId2,
        [{ playerId: p1, goals: 3, assists: 1, ownGoals: 0, cleanSheet: false }],
        "organizador",
      );

      const rows = await repo.listByPlayer(p1);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.matchId).sort()).toEqual([matchId1, matchId2].sort());
    });

    it("returns an empty array for a player with no stats", async () => {
      const p1 = await createPlayerId("P1");

      expect(await repo.listByPlayer(p1)).toEqual([]);
    });
  });
});
