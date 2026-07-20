import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createAttendanceRepository } from "../../src/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "../../src/http/api/matches/children/result/result.repository";
import { createMatchStatsRepository } from "../../src/http/api/matches/children/stats/stats.repository";
import { createVotesRepository } from "../../src/http/api/matches/children/votes/votes.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import { createPlayerCareerRepository } from "../../src/http/api/players/children/career/career.repository";
import { computeCareer } from "../../src/http/api/players/children/career/career-engine";
import type { MatchPerformance } from "../../src/http/api/players/children/career/career.types";
import { generateSlug, randomHex4 } from "../../src/http/api/players/player-slug";
import { withAttributeDefaults } from "../../src/http/api/players/players.catalog";
import type { Player } from "../../src/http/api/players/players.types";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

/**
 * Builds one `MatchPerformance` matching what `gatherPerformances` would
 * assemble for a single-match scenario, so a test can independently derive
 * the SAME `computeCareer` output the repository is expected to persist —
 * the pure attribute-growth arithmetic is unit-tested exhaustively in
 * `career-engine.test.ts`; this file only needs to prove the repository
 * wires the right base/affinity/performances into that engine and round-trips
 * the result through Prisma.
 */
function perf(
  affinity: Partial<Record<string, number>>,
  over: Partial<MatchPerformance> = {},
): MatchPerformance {
  return {
    matchId: over.matchId ?? "m1",
    datetime: over.datetime ?? "2026-08-01T20:00:00.000Z",
    affinity,
    outcome: over.outcome ?? "win",
    goals: over.goals ?? 0,
    assists: over.assists ?? 0,
    ownGoals: over.ownGoals ?? 0,
    cleanSheet: over.cleanSheet ?? false,
    mvpVotes: over.mvpVotes ?? 0,
    craqueVotes: over.craqueVotes ?? 0,
    melhorGoleiroVotes: over.melhorGoleiroVotes ?? 0,
  };
}

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

  /** A guest `Player` (`userId: null`) — `resolveAffinity` falls back to that match's `GroupMember.affinity` for these. */
  async function seedPlayer(name: string): Promise<Player> {
    const row = await testDb.prisma.player.create({
      data: { name, slug: generateSlug(name, randomHex4) },
    });
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      slug: row.slug,
      phone: row.phone,
      avatarUrl: row.avatarUrl,
      affinity: (row.affinity ?? {}) as Record<string, number>,
      attributes: (row.attributes ?? {}) as Player["attributes"],
      skills: (row.skills ?? []) as Player["skills"],
      dominantFoot: row.dominantFoot,
      weakFoot: row.weakFoot,
      skillMoves: row.skillMoves,
      heightCm: row.heightCm,
      weightKg: row.weightKg,
      birthYear: row.birthYear,
      preferredTeam: row.preferredTeam,
      nationality: row.nationality,
    };
  }

  /** A registered `Player` (`userId` set, linked to a throwaway `User`) with its OWN self-declared `affinity` — `resolveAffinity` prefers this over the group's. */
  async function seedRegisteredPlayer(
    name: string,
    userId: string,
    affinity: Record<string, number>,
  ): Promise<Player> {
    const row = await testDb.prisma.player.create({
      data: { name, userId, affinity, slug: generateSlug(name, randomHex4) },
    });
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      slug: row.slug,
      phone: row.phone,
      avatarUrl: row.avatarUrl,
      affinity: (row.affinity ?? {}) as Record<string, number>,
      attributes: (row.attributes ?? {}) as Player["attributes"],
      skills: (row.skills ?? []) as Player["skills"],
      dominantFoot: row.dominantFoot,
      weakFoot: row.weakFoot,
      skillMoves: row.skillMoves,
      heightCm: row.heightCm,
      weightKg: row.weightKg,
      birthYear: row.birthYear,
      preferredTeam: row.preferredTeam,
      nationality: row.nationality,
    };
  }

  describe("recomputeForPlayer", () => {
    it("bootstraps a guest's attributes from their group's affinity and trends up on a win with a goal", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player"); // guest — no `userId`, so `resolveAffinity` reads `GroupMember.affinity`.
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.groupMember.create({
        data: {
          groupId,
          playerId: player.id,
          role: "jogador",
          affinity: { campo_atacante: 60 },
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

      // Guest: `affinity` is `mergeMaxAffinity` over performances — here just
      // this match's `GroupMember.affinity`.
      const affinity = { campo_atacante: 60 };
      const expected = computeCareer({
        baseAttributes: withAttributeDefaults({}),
        affinity,
        performances: [perf(affinity, { goals: 2, outcome: "win" })],
      });

      expect(career.playerId).toBe(player.id);
      expect(career.matchesPlayed).toBe(1);
      expect(career.wins).toBe(1);
      expect(career.goals).toBe(2);
      expect(career.affinity).toEqual(affinity);
      expect(career.attributes).toEqual(expected.attributes);
      expect(career.level).toBe(expected.level);
    });

    it("bootstraps a registered player's attributes from their OWN Player.affinity, ignoring the group's affinity", async () => {
      const groupId = await seedGroup();
      const ownerUserId = await createOwner(testDb.prisma);
      const player = await seedRegisteredPlayer("Player", ownerUserId, { campo_meia: 60 });
      const opponent = await seedPlayer("Opponent");
      // Group-level affinity is deliberately different (and would bootstrap
      // to a different position/value) to prove `resolveAffinity` prefers
      // the player's own declared affinity once they're registered.
      await testDb.prisma.groupMember.create({
        data: {
          groupId,
          playerId: player.id,
          role: "jogador",
          affinity: { campo_atacante: 10 },
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

      // Registered: `affinity` is the player's OWN declared profile, not the
      // group's — the group's `campo_atacante: 10` never applies.
      const affinity = { campo_meia: 60 };
      const expected = computeCareer({
        baseAttributes: withAttributeDefaults({}),
        affinity,
        performances: [perf(affinity, { goals: 2, outcome: "win" })],
      });

      expect(career.affinity).toEqual(affinity);
      expect(career.attributes).toEqual(expected.attributes);
      expect(career.level).toBe(expected.level);
    });

    it("counts MVP votes toward mvpCount and nudges attributes, without letting fair_play affect them", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player"); // guest — reads `GroupMember.affinity`.
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.groupMember.create({
        data: {
          groupId,
          playerId: player.id,
          role: "jogador",
          affinity: { campo_meia: 50 },
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

      const affinity = { campo_meia: 50 };
      const expected = computeCareer({
        baseAttributes: withAttributeDefaults({}),
        affinity,
        performances: [perf(affinity, { goals: 0, outcome: "draw", mvpVotes: 1 })],
      });

      expect(career.mvpCount).toBe(1);
      expect(career.draws).toBe(1);
      // fair_play contributes nothing to growth — only reflected via mvpVotes above.
      expect(career.attributes).toEqual(expected.attributes);
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
      // No performances to replay: attributes stay at the guest baseline, affinity has nothing to merge.
      expect(career.attributes).toEqual(withAttributeDefaults({}));
      expect(career.affinity).toEqual({});
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

      expect(second.attributes).toEqual(first.attributes);
      expect(second.affinity).toEqual(first.affinity);
      expect(second.matchesPlayed).toBe(first.matchesPlayed);
      expect(second.wins).toBe(first.wins);
      expect(second.level).toBe(first.level);
    });

    it("overwrites any previously-stored affinity with the freshly-resolved declared profile — the engine now writes affinity, it's no longer preserved verbatim", async () => {
      const groupId = await seedGroup();
      const player = await seedPlayer("Player"); // guest, no `GroupMember` row created below — `resolveAffinity` resolves to `{}`.
      const opponent = await seedPlayer("Opponent");
      await testDb.prisma.playerCareer.create({
        data: { playerId: player.id, affinity: { campo_atacante: 80 } },
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

      // No `GroupMember` row for this guest -> `resolveAffinity` yields `{}` for
      // the match -> `mergeMaxAffinity` yields `{}` -> the stale `{ campo_atacante: 80 }` is gone.
      expect(career.affinity).toEqual({});
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
