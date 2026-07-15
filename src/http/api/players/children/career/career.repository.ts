import type { Prisma } from "@/generated/prisma/client";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { Position } from "@/http/api/groups/children/members/members.types";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "@/http/api/matches/children/result/result.repository";
import { createMatchStatsRepository } from "@/http/api/matches/children/stats/stats.repository";
import type { MatchStat } from "@/http/api/matches/children/stats/stats.types";
import { createVotesRepository } from "@/http/api/matches/children/votes/votes.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import type { PrismaLike } from "@/infra/db/client";
import type {
  ComputedCareer,
  MatchOutcome,
  MatchPerformance,
  PlayerCareer,
  PlayerLevel,
} from "./career.types";
import { computeCareer } from "./career-engine";

type PlayerCareerRow = {
  id: string;
  playerId: string;
  overall: unknown;
  affinity: unknown;
  level: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  mvpCount: number;
  currentStreak: number;
  bestStreak: number;
  updatedAt: Date;
};

function toDomainCareer(row: PlayerCareerRow): PlayerCareer {
  return {
    id: row.id,
    playerId: row.playerId,
    overall: (row.overall ?? {}) as Partial<Record<Position, number>>,
    affinity: (row.affinity ?? {}) as Partial<Record<Position, number>>,
    level: row.level as PlayerLevel,
    matchesPlayed: row.matchesPlayed,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goals: row.goals,
    assists: row.assists,
    cleanSheets: row.cleanSheets,
    mvpCount: row.mvpCount,
    currentStreak: row.currentStreak,
    bestStreak: row.bestStreak,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The player's own team's result for one match — `"draw"` (neutral) when it
 * can't be resolved: no `MatchResult` recorded yet (shouldn't happen for a
 * `"closed"`/finalized match, but defensive), or the `MatchStat` row carries
 * no `team` (stats logged before `generate-teams` ran). A "draw" contributes
 * 0 to the outcome-based part of the signal and doesn't break `currentStreak`
 * — the closest neutral reading available given Fase 1 doesn't track a
 * separate "unknown" outcome.
 */
function deriveOutcome(
  result: { winnerTeam: number | null } | null,
  team: number | null,
): MatchOutcome {
  if (!result || team === null) return "draw";
  if (result.winnerTeam === null) return "draw";
  return result.winnerTeam === team ? "win" : "loss";
}

export interface PlayerCareerRepository {
  /**
   * Replays the player's ENTIRE finalized match history (every match whose
   * `status` is `"closed"` — see `finalize-match` — where this player was a
   * CONFIRMED attendee AND had a `MatchStat` row logged) through the pure
   * `computeCareer` engine, then persists the result. Never incrementally
   * mutates the previously-stored row — recomputing from the same match
   * history twice always yields the same values (idempotent), which is what
   * lets `finalize-match` and the finalize cron call this freely on
   * re-finalize without special-casing "already ran".
   */
  recomputeForPlayer(playerId: string): Promise<PlayerCareer>;
  findByPlayer(playerId: string): Promise<PlayerCareer | null>;
  /** Upsert keyed by `playerId` — `affinity` is intentionally left untouched by the engine (player-declared, see `PlayerCareer`'s doc comment) and defaults to `{}` only on first creation. */
  upsert(playerId: string, computed: ComputedCareer): Promise<PlayerCareer>;
}

/** Factory `createPlayerCareerRepository(db: PrismaLike)` — composes the other repos it needs to gather a player's match history straight from `db`. */
export function createPlayerCareerRepository(db: PrismaLike): PlayerCareerRepository {
  const matchesRepo = createMatchesRepository(db);
  const attendanceRepo = createAttendanceRepository(db);
  const statsRepo = createMatchStatsRepository(db);
  const resultRepo = createMatchResultRepository(db);
  const votesRepo = createVotesRepository(db);
  const membersRepo = createMembersRepository(db);

  /**
   * Assembles `MatchPerformance[]` for `playerId` from the player's
   * confirmed attendances, cross-referenced with each match's own status
   * (only `"closed"` counts), `MatchStat` (only matches with a logged stat
   * row contribute — no stat means nothing to grow from), `MatchResult`
   * (win/draw/loss), the match's group `GroupMember` row (position(s) +
   * bootstrap seed), and votes received in that match. Order is whatever
   * `attendanceRepo.listByPlayer` returns — `computeCareer` itself sorts
   * chronologically, so this doesn't need to.
   */
  async function gatherPerformances(playerId: string): Promise<MatchPerformance[]> {
    const attendances = await attendanceRepo.listByPlayer(playerId);
    const confirmed = attendances.filter((a) => a.status === "confirmed");
    if (confirmed.length === 0) return [];

    const stats = await statsRepo.listByPlayer(playerId);
    const statByMatch = new Map<string, MatchStat>(stats.map((s) => [s.matchId, s]));

    const performances: MatchPerformance[] = [];
    for (const attendance of confirmed) {
      const stat = statByMatch.get(attendance.matchId);
      if (!stat) continue; // nothing logged for this player in this match — no signal to replay

      const match = await matchesRepo.findById(attendance.matchId);
      if (match?.status !== "closed") continue; // only finalized matches count

      const [result, votes, member] = await Promise.all([
        resultRepo.findByMatch(attendance.matchId),
        votesRepo.listByMatch(attendance.matchId),
        membersRepo.findByGroupAndPlayer(match.groupId, playerId),
      ]);

      const votesForPlayer = votes.filter((v) => v.votedPlayerId === playerId);
      const countVotes = (category: string) =>
        votesForPlayer.filter((v) => v.category === category).length;

      performances.push({
        matchId: match.id,
        datetime: match.datetime,
        position: member?.primaryPos ?? "meia",
        secondaryPositions: member?.secondaryPos ?? [],
        seedOverall: member?.seedOverall ?? {},
        outcome: deriveOutcome(result, stat.team),
        goals: stat.goals,
        assists: stat.assists,
        ownGoals: stat.ownGoals,
        cleanSheet: stat.cleanSheet,
        mvpVotes: countVotes("mvp"),
        craqueVotes: countVotes("craque"),
        melhorGoleiroVotes: countVotes("melhor_goleiro"),
      });
    }

    return performances;
  }

  const repo: PlayerCareerRepository = {
    async recomputeForPlayer(playerId) {
      const performances = await gatherPerformances(playerId);
      const computed = computeCareer(performances);
      return repo.upsert(playerId, computed);
    },

    async findByPlayer(playerId) {
      const row = await db.playerCareer.findUnique({ where: { playerId } });
      return row ? toDomainCareer(row) : null;
    },

    async upsert(playerId, computed) {
      const overallJson = computed.overall as unknown as Prisma.InputJsonValue;
      const row = await db.playerCareer.upsert({
        where: { playerId },
        create: {
          playerId,
          overall: overallJson,
          affinity: {},
          level: computed.level,
          matchesPlayed: computed.matchesPlayed,
          wins: computed.wins,
          draws: computed.draws,
          losses: computed.losses,
          goals: computed.goals,
          assists: computed.assists,
          cleanSheets: computed.cleanSheets,
          mvpCount: computed.mvpCount,
          currentStreak: computed.currentStreak,
          bestStreak: computed.bestStreak,
        },
        update: {
          overall: overallJson,
          level: computed.level,
          matchesPlayed: computed.matchesPlayed,
          wins: computed.wins,
          draws: computed.draws,
          losses: computed.losses,
          goals: computed.goals,
          assists: computed.assists,
          cleanSheets: computed.cleanSheets,
          mvpCount: computed.mvpCount,
          currentStreak: computed.currentStreak,
          bestStreak: computed.bestStreak,
          // `affinity` intentionally omitted from `update` — player-declared
          // data the growth engine never touches (see `PlayerCareer`'s doc
          // comment), preserved as-is across every recompute.
        },
      });
      return toDomainCareer(row);
    },
  };

  return repo;
}
