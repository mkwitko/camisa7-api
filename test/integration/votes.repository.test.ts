import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createVotesRepository } from "../../src/http/api/matches/children/votes/votes.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("votesRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createVotesRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createVotesRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Vote", "Match", "Group", "Player", "User" CASCADE',
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
    const player = await testDb.prisma.player.create({ data: { name } });
    return player.id;
  }

  describe("upsert", () => {
    it("creates a new row when none exists for (matchId, voterPlayerId, category)", async () => {
      const matchId = await createMatchId();
      const voter = await createPlayerId("Voter");
      const voted = await createPlayerId("Voted");

      const vote = await repo.upsert(matchId, voter, "mvp", voted);

      expect(vote.matchId).toBe(matchId);
      expect(vote.voterPlayerId).toBe(voter);
      expect(vote.category).toBe("mvp");
      expect(vote.votedPlayerId).toBe(voted);
    });

    it("changing the vote for the same (matchId, voterPlayerId, category) corrects the same row", async () => {
      const matchId = await createMatchId();
      const voter = await createPlayerId("Voter");
      const votedA = await createPlayerId("VotedA");
      const votedB = await createPlayerId("VotedB");

      const first = await repo.upsert(matchId, voter, "mvp", votedA);
      const corrected = await repo.upsert(matchId, voter, "mvp", votedB);

      expect(corrected.id).toBe(first.id);
      expect(corrected.votedPlayerId).toBe(votedB);

      const rows = await testDb.prisma.vote.findMany({
        where: { matchId, voterPlayerId: voter, category: "mvp" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.votedPlayerId).toBe(votedB);
    });

    it("allows the same voter to vote in different categories independently", async () => {
      const matchId = await createMatchId();
      const voter = await createPlayerId("Voter");
      const votedMvp = await createPlayerId("VotedMvp");
      const votedCraque = await createPlayerId("VotedCraque");

      await repo.upsert(matchId, voter, "mvp", votedMvp);
      await repo.upsert(matchId, voter, "craque", votedCraque);

      const rows = await testDb.prisma.vote.findMany({ where: { matchId, voterPlayerId: voter } });
      expect(rows).toHaveLength(2);
    });

    it("enforces the (matchId, voterPlayerId, category) unique constraint at the DB level", async () => {
      const matchId = await createMatchId();
      const voter = await createPlayerId("Voter");
      const voted = await createPlayerId("Voted");

      await testDb.prisma.vote.create({
        data: { matchId, voterPlayerId: voter, category: "mvp", votedPlayerId: voted },
      });

      await expect(
        testDb.prisma.vote.create({
          data: { matchId, voterPlayerId: voter, category: "mvp", votedPlayerId: voted },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  describe("tallyByMatch", () => {
    it("aggregates counts per category/candidate and reports the leader", async () => {
      const matchId = await createMatchId();
      const voter1 = await createPlayerId("Voter1");
      const voter2 = await createPlayerId("Voter2");
      const voter3 = await createPlayerId("Voter3");
      const candidateA = await createPlayerId("CandidateA");
      const candidateB = await createPlayerId("CandidateB");

      await repo.upsert(matchId, voter1, "mvp", candidateA);
      await repo.upsert(matchId, voter2, "mvp", candidateA);
      await repo.upsert(matchId, voter3, "mvp", candidateB);

      const tally = await repo.tallyByMatch(matchId);

      expect(tally).toHaveLength(4); // all 4 categories always present
      const mvp = tally.find((c) => c.category === "mvp");
      expect(mvp?.leaderPlayerId).toBe(candidateA);
      expect([...(mvp?.tally ?? [])].sort((a, b) => b.votes - a.votes)).toEqual([
        { playerId: candidateA, votes: 2 },
        { playerId: candidateB, votes: 1 },
      ]);

      const untouched = tally.find((c) => c.category === "fair_play");
      expect(untouched?.tally).toEqual([]);
      expect(untouched?.leaderPlayerId).toBeNull();
    });

    it("reports leaderPlayerId as null when the top spot is tied", async () => {
      const matchId = await createMatchId();
      const voter1 = await createPlayerId("Voter1");
      const voter2 = await createPlayerId("Voter2");
      const candidateA = await createPlayerId("CandidateA");
      const candidateB = await createPlayerId("CandidateB");

      await repo.upsert(matchId, voter1, "craque", candidateA);
      await repo.upsert(matchId, voter2, "craque", candidateB);

      const tally = await repo.tallyByMatch(matchId);
      const craque = tally.find((c) => c.category === "craque");

      expect(craque?.leaderPlayerId).toBeNull();
      expect(craque?.tally).toHaveLength(2);
    });

    it("returns an all-empty tally when no votes have been cast", async () => {
      const matchId = await createMatchId();

      const tally = await repo.tallyByMatch(matchId);

      expect(tally).toHaveLength(4);
      for (const category of tally) {
        expect(category.tally).toEqual([]);
        expect(category.leaderPlayerId).toBeNull();
      }
    });

    it("does not mix votes from a different match", async () => {
      const matchId1 = await createMatchId();
      const matchId2 = await createMatchId();
      const voter = await createPlayerId("Voter");
      const candidate = await createPlayerId("Candidate");

      await repo.upsert(matchId1, voter, "mvp", candidate);

      const tally = await repo.tallyByMatch(matchId2);
      const mvp = tally.find((c) => c.category === "mvp");
      expect(mvp?.tally).toEqual([]);
    });
  });

  describe("listByMatch", () => {
    it("returns every raw vote row for a match", async () => {
      const matchId = await createMatchId();
      const voter1 = await createPlayerId("Voter1");
      const voter2 = await createPlayerId("Voter2");
      const candidate = await createPlayerId("Candidate");

      await repo.upsert(matchId, voter1, "mvp", candidate);
      await repo.upsert(matchId, voter2, "craque", candidate);

      const rows = await repo.listByMatch(matchId);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.category).sort()).toEqual(["craque", "mvp"]);
    });

    it("returns an empty array when nothing has been cast", async () => {
      const matchId = await createMatchId();

      expect(await repo.listByMatch(matchId)).toEqual([]);
    });
  });
});
