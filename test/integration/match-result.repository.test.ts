import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchResultRepository } from "../../src/http/api/matches/children/result/result.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("matchResultRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createMatchResultRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createMatchResultRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MatchResult", "Match", "Group", "User" CASCADE',
    );
  });

  async function createMatchId(): Promise<{ matchId: string; ownerId: string }> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    const match = await matchesRepo.insert({
      groupId: group.id,
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
    });
    return { matchId: match.id, ownerId };
  }

  describe("upsert", () => {
    it("creates a result when none exists", async () => {
      const { matchId, ownerId } = await createMatchId();

      const result = await repo.upsert(matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
        winnerTeam: 0,
        recordedById: ownerId,
      });

      expect(result.matchId).toBe(matchId);
      expect(result.scores).toEqual([
        { team: 0, goals: 3 },
        { team: 1, goals: 1 },
      ]);
      expect(result.winnerTeam).toBe(0);
      expect(result.recordedById).toBe(ownerId);
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof result.recordedAt).toBe("string");
    });

    it("overwrites the existing row instead of creating a second one", async () => {
      const { matchId, ownerId } = await createMatchId();
      const first = await repo.upsert(matchId, {
        scores: [
          { team: 0, goals: 3 },
          { team: 1, goals: 1 },
        ],
        winnerTeam: 0,
        recordedById: ownerId,
      });

      const corrected = await repo.upsert(matchId, {
        scores: [
          { team: 0, goals: 2 },
          { team: 1, goals: 2 },
        ],
        winnerTeam: null,
        recordedById: ownerId,
      });

      expect(corrected.id).toBe(first.id);
      expect(corrected.scores).toEqual([
        { team: 0, goals: 2 },
        { team: 1, goals: 2 },
      ]);
      expect(corrected.winnerTeam).toBeNull();

      const rows = await testDb.prisma.matchResult.findMany({ where: { matchId } });
      expect(rows).toHaveLength(1);
    });
  });

  describe("findByMatch", () => {
    it("returns the persisted result", async () => {
      const { matchId, ownerId } = await createMatchId();
      const inserted = await repo.upsert(matchId, {
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
        winnerTeam: 0,
        recordedById: ownerId,
      });

      const found = await repo.findByMatch(matchId);

      expect(found).toEqual(inserted);
    });

    it("returns null when no result has been recorded", async () => {
      const { matchId } = await createMatchId();

      expect(await repo.findByMatch(matchId)).toBeNull();
    });
  });
});
