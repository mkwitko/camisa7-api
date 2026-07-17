import type { PrismaLike } from "@/infra/db/client";

export type TimelineEvent = {
  matchId: string;
  /** ISO — datetime da partida (pro app agrupar em Hoje/Ontem/Semana passada). */
  datetime: string;
  type: "hat_trick" | "goals" | "assists" | "mvp" | "clean_sheet";
  icon: string;
  text: string;
};

export interface TimelineRepository {
  /** Marcos do jogador (partidas fechadas), mais recentes primeiro, até `limit`. */
  build(playerId: string, limit: number): Promise<TimelineEvent[]>;
}

export function createTimelineRepository(db: PrismaLike): TimelineRepository {
  return {
    async build(playerId, limit) {
      const stats = await db.matchStat.findMany({
        where: { playerId, match: { status: "closed" } },
        select: {
          matchId: true,
          goals: true,
          assists: true,
          cleanSheet: true,
          match: { select: { datetime: true } },
        },
      });
      if (stats.length === 0) return [];

      const matchIds = stats.map((s) => s.matchId);
      const mvpVotes = await db.vote.groupBy({
        by: ["matchId"],
        where: { votedPlayerId: playerId, matchId: { in: matchIds }, category: "mvp" },
        _count: { _all: true },
      });
      const mvpByMatch = new Map(mvpVotes.map((v) => [v.matchId, v._count._all]));

      const events: TimelineEvent[] = [];
      for (const s of stats) {
        const datetime = s.match.datetime.toISOString();
        const base = { matchId: s.matchId, datetime };

        if (s.goals >= 3) {
          events.push({ ...base, type: "hat_trick", icon: "⚽", text: `Hat-trick (${s.goals} gols)` });
        } else if (s.goals > 0) {
          events.push({ ...base, type: "goals", icon: "⚽", text: s.goals === 1 ? "1 gol" : `${s.goals} gols` });
        }
        if (s.assists > 0) {
          events.push({
            ...base,
            type: "assists",
            icon: "🎯",
            text: s.assists === 1 ? "1 assistência" : `${s.assists} assistências`,
          });
        }
        if ((mvpByMatch.get(s.matchId) ?? 0) > 0) {
          events.push({ ...base, type: "mvp", icon: "🏆", text: "Eleito MVP" });
        }
        if (s.cleanSheet) {
          events.push({ ...base, type: "clean_sheet", icon: "🧤", text: "Jogo sem sofrer gol" });
        }
      }

      events.sort((a, b) => b.datetime.localeCompare(a.datetime));
      return events.slice(0, limit);
    },
  };
}
