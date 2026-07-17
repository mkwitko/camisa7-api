import type { MatchStatus } from "@/http/api/matches/matches.types";
import type { PrismaLike } from "@/infra/db/client";

/**
 * A future match in one of the caller's groups, enriched with the group name
 * and the caller's own attendance status — the shape the "Início" home screen
 * renders. Not a domain `Match`: it carries per-viewer, cross-aggregate fields
 * (`groupName`, `attendanceStatus`) that only make sense for this one query.
 */
export type UpcomingMatchForPlayer = {
  id: string;
  groupId: string;
  groupName: string;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  status: MatchStatus;
  seriesId: string | null;
  attendanceStatus: "confirmed" | "waitlisted" | null;
};

export interface UpcomingMatchesRepository {
  /**
   * Future matches (`datetime >= now`, not finished/cancelled) across every
   * group the player belongs to, chronological, capped at `limit`. Each row
   * carries the player's active (`confirmed`/`waitlisted`) attendance status,
   * or `null` if they haven't responded.
   */
  listUpcomingForPlayer(
    playerId: string,
    now: Date,
    limit: number,
  ): Promise<UpcomingMatchForPlayer[]>;
}

export function createUpcomingMatchesRepository(db: PrismaLike): UpcomingMatchesRepository {
  return {
    async listUpcomingForPlayer(playerId, now, limit) {
      const rows = await db.match.findMany({
        where: {
          datetime: { gte: now },
          status: { in: ["open", "full", "closed"] },
          group: { members: { some: { playerId } } },
        },
        orderBy: { datetime: "asc" },
        take: limit,
        include: {
          group: { select: { name: true } },
          attendances: {
            where: { playerId, status: { in: ["confirmed", "waitlisted"] } },
            select: { status: true },
            take: 1,
          },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        groupId: row.groupId,
        groupName: row.group.name,
        datetime: row.datetime.toISOString(),
        location: row.location,
        priceCents: row.priceCents,
        slots: row.slots,
        status: row.status as MatchStatus,
        seriesId: row.seriesId ?? null,
        attendanceStatus: (row.attendances[0]?.status ?? null) as "confirmed" | "waitlisted" | null,
      }));
    },
  };
}
