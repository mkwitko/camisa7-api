import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createAttendanceRepository } from "../../src/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "../../src/http/api/matches/children/result/result.repository";
import { createFinalizeMatchCore } from "../../src/http/api/matches/finalize-match/finalize-match.core";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { createPlayerCareerRepository } from "../../src/http/api/players/children/career/career.repository";
import { finalizeElapsedMatches } from "../../src/jobs/finalize-matches.job";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

const HOUR_MS = 60 * 60 * 1000;

describe("finalizeElapsedMatches (integration)", () => {
  let testDb: TestDb;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;
  let resultRepo: ReturnType<typeof createMatchResultRepository>;
  let finalizeOne: (matchId: string) => ReturnType<ReturnType<typeof createFinalizeMatchCore>>;

  beforeAll(async () => {
    testDb = await startTestDb();
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
    resultRepo = createMatchResultRepository(testDb.prisma);
    finalizeOne = createFinalizeMatchCore({
      matchesRepo,
      resultRepo,
      attendanceRepo: createAttendanceRepository(testDb.prisma),
      careerRepo: createPlayerCareerRepository(testDb.prisma),
    });
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "MatchResult", "Attendance", "Match", "Group", "User" CASCADE',
    );
  });

  async function createGroupId(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    return group.id;
  }

  async function seedMatch(groupId: string, datetime: string): Promise<string> {
    const match = await matchesRepo.insert({
      groupId,
      datetime,
      location: "Quadra Central",
      priceCents: 0,
      slots: 10,
    });
    return match.id;
  }

  it("finalizes a finished match with a recorded result once its 48h voting window has elapsed", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const groupId = await createGroupId();
    const matchId = await seedMatch(groupId, new Date(now.getTime() - 72 * HOUR_MS).toISOString());
    await matchesRepo.setStatus(matchId, "finished");
    await resultRepo.upsert(matchId, {
      scores: [
        { team: 0, goals: 1 },
        { team: 1, goals: 0 },
      ],
      winnerTeam: 0,
      recordedById: "00000000-0000-0000-0000-000000000000",
    });

    const finalized = await finalizeElapsedMatches({ matchesRepo, finalizeOne }, now);

    expect(finalized).toHaveLength(1);
    expect(finalized[0]?.id).toBe(matchId);
    expect(finalized[0]?.status).toBe("closed");
  });

  it("does not finalize a finished+resulted match still within the 48h window", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const groupId = await createGroupId();
    const matchId = await seedMatch(groupId, new Date(now.getTime() - HOUR_MS).toISOString());
    await matchesRepo.setStatus(matchId, "finished");
    await resultRepo.upsert(matchId, {
      scores: [
        { team: 0, goals: 1 },
        { team: 1, goals: 0 },
      ],
      winnerTeam: 0,
      recordedById: "00000000-0000-0000-0000-000000000000",
    });

    const finalized = await finalizeElapsedMatches({ matchesRepo, finalizeOne }, now);

    expect(finalized).toEqual([]);
    const match = await matchesRepo.findById(matchId);
    expect(match?.status).toBe("finished");
  });

  it("does not select a finished match with no result recorded, however old", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const groupId = await createGroupId();
    const matchId = await seedMatch(groupId, new Date(now.getTime() - 200 * HOUR_MS).toISOString());
    await matchesRepo.setStatus(matchId, "finished");

    const finalized = await finalizeElapsedMatches({ matchesRepo, finalizeOne }, now);

    expect(finalized).toEqual([]);
    const match = await matchesRepo.findById(matchId);
    expect(match?.status).toBe("finished");
  });

  it("does not re-select an already-closed match", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const groupId = await createGroupId();
    const matchId = await seedMatch(groupId, new Date(now.getTime() - 72 * HOUR_MS).toISOString());
    await matchesRepo.setStatus(matchId, "closed");
    await resultRepo.upsert(matchId, {
      scores: [
        { team: 0, goals: 1 },
        { team: 1, goals: 0 },
      ],
      winnerTeam: 0,
      recordedById: "00000000-0000-0000-0000-000000000000",
    });

    const finalized = await finalizeElapsedMatches({ matchesRepo, finalizeOne }, now);

    expect(finalized).toEqual([]);
  });
});
