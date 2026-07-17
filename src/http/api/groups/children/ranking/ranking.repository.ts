import type { PrismaLike } from "@/infra/db/client";

export type RankRow = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
};

export type GroupRanking = {
  goals: RankRow[];
  assists: RankRow[];
  cleanSheets: RankRow[];
  mvp: RankRow[];
  presence: RankRow[];
  points: RankRow[];
};

/** Pesos da pontuação composta. */
const POINTS = { goal: 3, assist: 2, mvp: 5, presence: 1 } as const;

export interface RankingRepository {
  /** Ranking agregado do grupo sobre suas partidas fechadas/finalizadas. */
  computeRanking(groupId: string, limit: number): Promise<GroupRanking>;
}

function topBy(
  metrics: Map<string, { name: string; avatarUrl: string | null; value: number }>,
  limit: number,
): RankRow[] {
  return [...metrics.entries()]
    .map(([playerId, m]) => ({ playerId, name: m.name, avatarUrl: m.avatarUrl, value: m.value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const EMPTY_RANKING: GroupRanking = {
  goals: [],
  assists: [],
  cleanSheets: [],
  mvp: [],
  presence: [],
  points: [],
};

/**
 * Agrega o ranking sobre um conjunto de partidas (matchIds). Reutilizado pelo
 * ranking de grupo (partidas do grupo) e pelo ranking global (todas as partidas
 * fechadas, ou de uma cidade). Vazio quando `matchIds` está vazio.
 */
export async function aggregateRanking(
  db: PrismaLike,
  matchIds: string[],
  limit: number,
): Promise<GroupRanking> {
  if (matchIds.length === 0) return EMPTY_RANKING;

  const [statSum, cleanSheets, mvpVotes, presence] = await Promise.all([
        db.matchStat.groupBy({
          by: ["playerId"],
          where: { matchId: { in: matchIds } },
          _sum: { goals: true, assists: true },
        }),
        db.matchStat.groupBy({
          by: ["playerId"],
          where: { matchId: { in: matchIds }, cleanSheet: true },
          _count: { _all: true },
        }),
        db.vote.groupBy({
          by: ["votedPlayerId"],
          where: { matchId: { in: matchIds }, category: "mvp" },
          _count: { _all: true },
        }),
        db.attendance.groupBy({
          by: ["playerId"],
          where: { matchId: { in: matchIds }, status: "confirmed" },
          _count: { _all: true },
        }),
      ]);

      // Per-player accumulator.
      const acc = new Map<
        string,
        { goals: number; assists: number; cleanSheets: number; mvp: number; presence: number }
      >();
      const ensure = (id: string) => {
        let e = acc.get(id);
        if (!e) {
          e = { goals: 0, assists: 0, cleanSheets: 0, mvp: 0, presence: 0 };
          acc.set(id, e);
        }
        return e;
      };
      for (const r of statSum) {
        const e = ensure(r.playerId);
        e.goals = r._sum.goals ?? 0;
        e.assists = r._sum.assists ?? 0;
      }
      for (const r of cleanSheets) ensure(r.playerId).cleanSheets = r._count._all;
      for (const r of mvpVotes) ensure(r.votedPlayerId).mvp = r._count._all;
      for (const r of presence) ensure(r.playerId).presence = r._count._all;

      const players = await db.player.findMany({
        where: { id: { in: [...acc.keys()] } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const nameById = new Map(players.map((p) => [p.id, { name: p.name, avatarUrl: p.avatarUrl }]));

      const build = (pick: (e: NonNullable<ReturnType<typeof acc.get>>) => number) => {
        const m = new Map<string, { name: string; avatarUrl: string | null; value: number }>();
        for (const [id, e] of acc) {
          const p = nameById.get(id);
          if (!p) continue;
          m.set(id, { name: p.name, avatarUrl: p.avatarUrl, value: pick(e) });
        }
        return topBy(m, limit);
      };

      return {
        goals: build((e) => e.goals),
        assists: build((e) => e.assists),
        cleanSheets: build((e) => e.cleanSheets),
        mvp: build((e) => e.mvp),
        presence: build((e) => e.presence),
    points: build(
      (e) =>
        e.goals * POINTS.goal +
        e.assists * POINTS.assist +
        e.mvp * POINTS.mvp +
        e.presence * POINTS.presence,
    ),
  };
}

export function createRankingRepository(db: PrismaLike): RankingRepository {
  return {
    async computeRanking(groupId, limit) {
      const matches = await db.match.findMany({
        where: { groupId, status: { in: ["closed", "finished"] } },
        select: { id: true },
      });
      return aggregateRanking(
        db,
        matches.map((m) => m.id),
        limit,
      );
    },
  };
}
