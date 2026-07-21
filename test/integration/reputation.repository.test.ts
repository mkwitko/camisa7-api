import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { createReputationRepository } from "../../src/http/api/matches/children/reputation/reputation.repository";
import { generateSlug, randomHex4 } from "../../src/http/api/players/player-slug";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("reputationRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createReputationRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createReputationRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ReputationTag", "Match", "Group", "Player", "User" CASCADE',
    );
  });

  async function createMatchId(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    const match = await matchesRepo.insert({
      groupId: group.id,
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
    });
    return match.id;
  }

  async function createPlayerId(name = "Player"): Promise<string> {
    const player = await testDb.prisma.player.create({
      data: { name, slug: generateSlug(name, randomHex4) },
    });
    return player.id;
  }

  describe("replaceForVoter / listByVoter", () => {
    it("replaceForVoter inserts the voter's tag set", async () => {
      const matchId = await createMatchId();
      const voterId = await createPlayerId("Voter");
      const bId = await createPlayerId("B");

      await repo.replaceForVoter(matchId, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade", "respeito"] },
      ]);

      expect(await repo.listByVoter(matchId, voterId)).toEqual([
        { votedPlayerId: bId, dimensions: expect.arrayContaining(["pontualidade", "respeito"]) },
      ]);
    });

    it("replaceForVoter is idempotent and removes dropped dimensions", async () => {
      const matchId = await createMatchId();
      const voterId = await createPlayerId("Voter");
      const bId = await createPlayerId("B");

      await repo.replaceForVoter(matchId, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade", "respeito"] },
      ]);
      await repo.replaceForVoter(matchId, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade"] },
      ]);

      const tags = await repo.listByVoter(matchId, voterId);
      expect(tags).toEqual([{ votedPlayerId: bId, dimensions: ["pontualidade"] }]);
    });

    it("replaceForVoter with an empty tag set clears all of the voter's tags on the match", async () => {
      const matchId = await createMatchId();
      const voterId = await createPlayerId("Voter");
      const bId = await createPlayerId("B");

      await repo.replaceForVoter(matchId, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade"] },
      ]);
      await repo.replaceForVoter(matchId, voterId, []);

      expect(await repo.listByVoter(matchId, voterId)).toEqual([]);
    });

    it("does not mix tags from a different voter or a different match", async () => {
      const matchId1 = await createMatchId();
      const matchId2 = await createMatchId();
      const voterId = await createPlayerId("Voter");
      const otherVoterId = await createPlayerId("OtherVoter");
      const bId = await createPlayerId("B");

      await repo.replaceForVoter(matchId1, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade"] },
      ]);
      await repo.replaceForVoter(matchId1, otherVoterId, [
        { votedPlayerId: bId, dimensions: ["educacao"] },
      ]);

      expect(await repo.listByVoter(matchId1, voterId)).toEqual([
        { votedPlayerId: bId, dimensions: ["pontualidade"] },
      ]);
      expect(await repo.listByVoter(matchId2, voterId)).toEqual([]);
    });
  });

  describe("countsByPlayer", () => {
    it("counts received tags per dimension across voters and matches", async () => {
      const matchId = await createMatchId();
      const voterId = await createPlayerId("Voter");
      const cId = await createPlayerId("C");
      const bId = await createPlayerId("B");

      await repo.replaceForVoter(matchId, voterId, [
        { votedPlayerId: bId, dimensions: ["pontualidade"] },
      ]);
      await repo.replaceForVoter(matchId, cId, [
        { votedPlayerId: bId, dimensions: ["pontualidade", "compromisso"] },
      ]);

      expect(await repo.countsByPlayer(bId)).toEqual({
        pontualidade: 2,
        educacao: 0,
        compromisso: 1,
        respeito: 0,
      });
    });

    it("returns all-zero counts for a player with no received tags", async () => {
      const bId = await createPlayerId("B");

      expect(await repo.countsByPlayer(bId)).toEqual({
        pontualidade: 0,
        educacao: 0,
        compromisso: 0,
        respeito: 0,
      });
    });
  });
});
