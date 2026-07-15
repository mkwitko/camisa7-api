import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createAttendanceRepository } from "../../src/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "../../src/http/api/matches/children/result/result.repository";
import { createMatchStatsRepository } from "../../src/http/api/matches/children/stats/stats.repository";
import { createVotesRepository } from "../../src/http/api/matches/children/votes/votes.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { createPlayerCareerRepository } from "../../src/http/api/players/children/career/career.repository";
import type { Player } from "../../src/http/api/players/players.types";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("playerCareerRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createPlayerCareerRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let attendanceRepo: ReturnType<typeof createAttendanceRepository>;
  let statsRepo: ReturnType<typeof createMatchStatsRepository>;
  let resultRepo: ReturnType<typeof createMatchResultRepository>;
  let votesRepo: ReturnType<typeof createVotesRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createPlayerCareerRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    attendanceRepo = createAttendanceRepository(testDb.prisma);
    statsRepo = createMatchStatsRepository(testDb.prisma);
    resultRepo = createMatchResultRepository(testDb.prisma);
    votesRepo = createVotesRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "Vote", "MatchStat", "MatchResult", "TeamAssignment", "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  async function seedGroup(): Promise<string> {
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

  /** Wires one fully-finalized match: `player` (team 0, given stat line) and `opponent` (team 1) both confirmed, a result recorded, stats logged, `match.status` set to `"closed"` (as `finalize-match` would leave it). */
  async function seedFinalizedMatch(opts: {
    groupId: string;
    datetime: string;
    player: Player;
    opponent: Player;
    playerGoals: number;
    playerAssists?: number;
    playerOwnGoals?: number;
    playerCleanSheet?: boolean;
    scores: { team: number; goals: number }[];
    winnerTeam: number | null;
  }): Promise<string> {
    const matchId = await seedMatch(opts.groupId, opts.datetime);
    await attendanceRepo.confirm(matchId, opts.player);
    await attendanceRepo.confirm(matchId, opts.opponent);
    await statsRepo.upsertMany(
      matchId,
      [
        {
          playerId: opts.player.id,
          team: 0,
          goals: opts.playerGoals,
          assists: opts.playerAssists ?? 0,
          ownGoals: opts.playerOwnGoals ?? 0,
          cleanSheet: opts.playerCleanSheet ?? false,
        },
        {
          playerId: opts.opponent.id,
          team: 1,
          goals: 0,
          assists: 0,
          ownGoals: 0,
          cleanSheet: false,
        },
      ],
      "organizador",
    );
    await resultRepo.upsert(matchId, {
      scores: opts.scores,
      winnerTeam: opts.winnerTeam,
      recordedById: opts.player.id,
    });
    await matchesRepo.setStatus(matchId, "closed");
    return matchId;
  }

  async function seedPlayer(name: string): Promise<Player> {
    const row = await testDb.prisma.player.create({ data: { name } });
    return { id: row.id, userId: row.userId, name: row.name, phone: row.phone };
  }

  describe("recomputeForPlayer", () => {
    it("bootstraps from the group's seedOverall and trends up on a win with a goal", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.groupMember.create({
        data: {
          groupId,
          playerId: player.id,
          role: "jogador",
          primaryPos: "atacante",
          secondaryPos: [],
          affinity: {},
          seedOverall: { atacante: 60 },
        },
      });

      await seedFinalizedMatch({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        player,
        opponent,
        playerGoals: 2,
        scores: [
          { team: 0, goals: 2 },
          { team: 1, goals: 1 },
        ],
        winnerTeam: 0,
      });

      const career = await repo.recomputeForPlayer(player.id);

      expect(career.playerId).toBe(player.id);
      expect(career.matchesPlayed).toBe(1);
      expect(career.wins).toBe(1);
      expect(career.goals).toBe(2);
      // win(6) + 2 goals(3 each) = raw 12, bounded to the +3 step cap: 60 -> 63.
      expect(career.overall.atacante).toBe(63);
      expect(career.level).toBe("bronze");
    });

    it("counts MVP votes toward mvpCount and nudges overall, without letting fair_play affect overall", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.groupMember.create({
        data: {
          groupId,
          playerId: player.id,
          role: "jogador",
          primaryPos: "meia",
          secondaryPos: [],
          affinity: {},
          seedOverall: { meia: 50 },
        },
      });
      const matchId = await seedFinalizedMatch({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        player,
        opponent,
        playerGoals: 0,
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 1 },
        ],
        winnerTeam: null,
      });
      await votesRepo.upsert(matchId, opponent.id, "mvp", player.id);
      await votesRepo.upsert(matchId, opponent.id, "fair_play", player.id);

      const career = await repo.recomputeForPlayer(player.id);

      expect(career.mvpCount).toBe(1);
      expect(career.draws).toBe(1);
      // draw(1) + mvp vote(4) = 5, bounded to +3: 50 -> 53. fair_play contributes nothing.
      expect(career.overall.meia).toBe(53);
    });

    it("only replays matches with a logged MatchStat row for this player", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      const matchId = await seedMatch(groupId, "2026-08-01T20:00:00.000Z");
      await attendanceRepo.confirm(matchId, player);
      await attendanceRepo.confirm(matchId, opponent);
      // No MatchStat logged for `player` at all, but the match IS closed with a result.
      await statsRepo.upsertMany(
        matchId,
        [{ playerId: opponent.id, team: 1, goals: 0, assists: 0, ownGoals: 0, cleanSheet: false }],
        "organizador",
      );
      await resultRepo.upsert(matchId, {
        scores: [
          { team: 0, goals: 0 },
          { team: 1, goals: 0 },
        ],
        winnerTeam: null,
        recordedById: player.id,
      });
      await matchesRepo.setStatus(matchId, "closed");

      const career = await repo.recomputeForPlayer(player.id);

      expect(career.matchesPlayed).toBe(0);
      expect(career.overall).toEqual({});
    });

    it("is idempotent — recomputing twice from the same match history yields the same values", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      await seedFinalizedMatch({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        player,
        opponent,
        playerGoals: 1,
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
        winnerTeam: 0,
      });

      const first = await repo.recomputeForPlayer(player.id);
      const second = await repo.recomputeForPlayer(player.id);

      expect(second.overall).toEqual(first.overall);
      expect(second.matchesPlayed).toBe(first.matchesPlayed);
      expect(second.wins).toBe(first.wins);
      expect(second.level).toBe(first.level);
    });

    it("preserves affinity (player-declared) across a recompute — the engine never writes it", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.playerCareer.create({
        data: { playerId: player.id, affinity: { atacante: 80 } },
      });
      await seedFinalizedMatch({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        player,
        opponent,
        playerGoals: 1,
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
        winnerTeam: 0,
      });

      const career = await repo.recomputeForPlayer(player.id);

      expect(career.affinity).toEqual({ atacante: 80 });
    });
  });

  describe("findByPlayer", () => {
    it("returns null when the player has no PlayerCareer row yet", async () => {
      const player = await seedPlayer("Player");

      expect(await repo.findByPlayer(player.id)).toBeNull();
    });

    it("returns the persisted career after a recompute", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player");
      const opponent = await seedPlayer("Opponent");
      await seedFinalizedMatch({
        groupId,
        datetime: "2026-08-01T20:00:00.000Z",
        player,
        opponent,
        playerGoals: 1,
        scores: [
          { team: 0, goals: 1 },
          { team: 1, goals: 0 },
        ],
        winnerTeam: 0,
      });
      const computed = await repo.recomputeForPlayer(player.id);

      const found = await repo.findByPlayer(player.id);

      expect(found).toEqual(computed);
    });
  });
});
