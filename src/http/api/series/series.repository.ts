import type { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import type { MatchSeries, RecurrenceRule, SeriesStatus } from "./series.types";

type SeriesRow = {
  id: string;
  groupId: string;
  rule: unknown;
  time: string | null;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

function toDomainSeries(row: SeriesRow): MatchSeries {
  return {
    id: row.id,
    groupId: row.groupId,
    rule: row.rule as RecurrenceRule,
    time: row.time,
    location: row.location,
    priceCents: row.priceCents,
    slots: row.slots,
    pixKey: row.pixKey,
    status: row.status as SeriesStatus,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type InsertSeriesInput = {
  groupId: string;
  rule: RecurrenceRule;
  time?: string | null | undefined;
  location: string;
  priceCents: number;
  slots: number;
  pixKey?: string | null | undefined;
  status?: SeriesStatus | undefined;
  startDate: string;
  endDate?: string | null | undefined;
};

export type UpdateSeriesPatch = {
  location?: string | undefined;
  priceCents?: number | undefined;
  slots?: number | undefined;
  pixKey?: string | null | undefined;
  time?: string | null | undefined;
  rule?: RecurrenceRule | undefined;
  status?: SeriesStatus | undefined;
  endDate?: string | null | undefined;
};

export interface SeriesRepository {
  insert(input: InsertSeriesInput): Promise<MatchSeries>;
  findById(id: string): Promise<MatchSeries | null>;
  listByGroup(groupId: string): Promise<MatchSeries[]>;
  update(id: string, patch: UpdateSeriesPatch): Promise<MatchSeries>;
  /** Series still `active`, with no `endDate` or an `endDate` strictly after `now` — feeds the recurrence job's top-up pass. */
  listActive(now: Date): Promise<MatchSeries[]>;
}

/** Factory `createSeriesRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createSeriesRepository(db: PrismaLike): SeriesRepository {
  return {
    async insert(input) {
      const row = await db.matchSeries.create({
        data: {
          groupId: input.groupId,
          rule: input.rule as unknown as Prisma.InputJsonValue,
          time: input.time ?? null,
          location: input.location,
          priceCents: input.priceCents,
          slots: input.slots,
          pixKey: input.pixKey ?? null,
          status: input.status ?? "active",
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
      });
      return toDomainSeries(row);
    },

    async findById(id) {
      const row = await db.matchSeries.findUnique({ where: { id } });
      return row ? toDomainSeries(row) : null;
    },

    async listByGroup(groupId) {
      const rows = await db.matchSeries.findMany({
        where: { groupId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomainSeries);
    },

    async update(id, patch) {
      const row = await db.matchSeries.update({
        where: { id },
        data: {
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
          ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
          ...(patch.pixKey !== undefined ? { pixKey: patch.pixKey } : {}),
          ...(patch.time !== undefined ? { time: patch.time } : {}),
          ...(patch.rule !== undefined
            ? { rule: patch.rule as unknown as Prisma.InputJsonValue }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.endDate !== undefined
            ? { endDate: patch.endDate ? new Date(patch.endDate) : null }
            : {}),
        },
      });
      return toDomainSeries(row);
    },

    async listActive(now) {
      const rows = await db.matchSeries.findMany({
        where: { status: "active", OR: [{ endDate: null }, { endDate: { gt: now } }] },
      });
      return rows.map(toDomainSeries);
    },
  };
}
