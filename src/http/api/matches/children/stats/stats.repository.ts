import type { PrismaLike } from "@/infra/db/client";
import type { MatchStat, MatchStatSource } from "./stats.types";

type MatchStatRow = {
  id: string;
  matchId: string;
  playerId: string;
  team: number | null;
  goals: number;
  assists: number;
  ownGoals: number;
  cleanSheet: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDomainMatchStat(row: MatchStatRow): MatchStat {
  return {
    id: row.id,
    matchId: row.matchId,
    playerId: row.playerId,
    team: row.team,
    goals: row.goals,
    assists: row.assists,
    ownGoals: row.ownGoals,
    cleanSheet: row.cleanSheet,
    source: row.source as MatchStatSource,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertMatchStatInput = {
  playerId: string;
  team?: number | null | undefined;
  goals: number;
  assists: number;
  ownGoals: number;
  cleanSheet: boolean;
};

export interface MatchStatsRepository {
  /**
   * Upserts one row per `rows` entry, keyed by `(matchId, playerId)` — `log-stats`
   * re-logging the same player corrects that row rather than accumulating history
   * (same "upsert to correct" convention `MatchResultRepository.upsert` uses). All
   * rows are written with the same `source` (Fase 1 always passes `"organizador"`).
   * Runs inside one transaction so a batch either fully lands or fully rolls back.
   */
  upsertMany(
    matchId: string,
    rows: UpsertMatchStatInput[],
    source: MatchStatSource,
  ): Promise<MatchStat[]>;
  /** All stat rows for a match, oldest first. */
  listByMatch(matchId: string): Promise<MatchStat[]>;
  /** All stat rows for a player across every match — feeds the F1-4 career-growth engine. */
  listByPlayer(playerId: string): Promise<MatchStat[]>;
}

/**
 * Runs `fn` inside an interactive transaction: if `db` is the base client
 * (has `$transaction`), open one; if `db` is itself already a
 * `Prisma.TransactionClient` (composed inside a parent tx), just run `fn`
 * directly against it. Same pattern as `attendance.repository.ts`'s
 * `runInTransaction`.
 */
async function runInTransaction<T>(db: PrismaLike, fn: (tx: PrismaLike) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return db.$transaction((tx) => fn(tx));
  return fn(db);
}

/** Factory `createMatchStatsRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMatchStatsRepository(db: PrismaLike): MatchStatsRepository {
  return {
    async upsertMany(matchId, rows, source) {
      return runInTransaction(db, async (tx) => {
        const results: MatchStat[] = [];
        for (const row of rows) {
          const persisted = await tx.matchStat.upsert({
            where: { matchId_playerId: { matchId, playerId: row.playerId } },
            create: {
              matchId,
              playerId: row.playerId,
              team: row.team ?? null,
              goals: row.goals,
              assists: row.assists,
              ownGoals: row.ownGoals,
              cleanSheet: row.cleanSheet,
              source,
            },
            update: {
              team: row.team ?? null,
              goals: row.goals,
              assists: row.assists,
              ownGoals: row.ownGoals,
              cleanSheet: row.cleanSheet,
              source,
            },
          });
          results.push(toDomainMatchStat(persisted));
        }
        return results;
      });
    },

    async listByMatch(matchId) {
      const rows = await db.matchStat.findMany({
        where: { matchId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toDomainMatchStat);
    },

    async listByPlayer(playerId) {
      const rows = await db.matchStat.findMany({
        where: { playerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toDomainMatchStat);
    },
  };
}
