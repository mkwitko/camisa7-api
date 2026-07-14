import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import type { Match, MatchStatus, RecurrenceRule } from "./matches.types";

/**
 * Prisma's typed API rejects a plain JS `null` for a nullable `Json?` column
 * (it's ambiguous between "not provided" and "store SQL/JSON null") — it
 * requires the `Prisma.JsonNull` sentinel instead. This maps our domain
 * `RecurrenceRule` (`{...} | null`) to what `data.recurrenceRule` accepts.
 */
function toRecurrenceRuleInput(
  rule: RecurrenceRule,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return rule === null ? Prisma.JsonNull : rule;
}

type MatchRow = {
  id: string;
  groupId: string;
  datetime: Date;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: string;
  recurrenceRule: unknown;
  createdAt: Date;
};

function toDomainMatch(row: MatchRow): Match {
  return {
    id: row.id,
    groupId: row.groupId,
    datetime: row.datetime.toISOString(),
    location: row.location,
    priceCents: row.priceCents,
    slots: row.slots,
    pixKey: row.pixKey,
    status: row.status as MatchStatus,
    recurrenceRule: (row.recurrenceRule ?? null) as RecurrenceRule,
    createdAt: row.createdAt.toISOString(),
  };
}

export type InsertMatchInput = {
  groupId: string;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  pixKey?: string | null | undefined;
  recurrenceRule?: RecurrenceRule | undefined;
};

export type UpdateMatchPatch = {
  datetime?: string | undefined;
  location?: string | undefined;
  priceCents?: number | undefined;
  slots?: number | undefined;
  pixKey?: string | null | undefined;
  recurrenceRule?: RecurrenceRule | undefined;
};

export interface MatchesRepository {
  insert(input: InsertMatchInput): Promise<Match>;
  findById(id: string): Promise<Match | null>;
  listByGroup(groupId: string, opts: { includeFinished: boolean }): Promise<Match[]>;
  update(id: string, patch: UpdateMatchPatch): Promise<Match>;
  setStatus(id: string, status: MatchStatus, tx?: PrismaLike): Promise<Match>;
  /**
   * Candidates for Task 11's recurrence cron: `finished` matches carrying a
   * (non-null) `recurrenceRule` whose group has no future (`datetime > now`)
   * `open`/`full` sibling yet — i.e. the next occurrence hasn't been created
   * already. Group-scoped, not series-scoped (a group with two independent
   * weekly series would have one block the other's regeneration) — accepted
   * per the brief, most groups run a single recurring match.
   */
  findFinishedRecurringWithoutFutureSibling(now: Date): Promise<Match[]>;
  /** Inserts the next `open` occurrence, cloning `from`'s shape at `datetime`. */
  createNextOccurrence(from: Match, datetime: Date): Promise<Match>;
}

/** Factory `createMatchesRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMatchesRepository(db: PrismaLike): MatchesRepository {
  const repo: MatchesRepository = {
    async insert(input) {
      const row = await db.match.create({
        data: {
          groupId: input.groupId,
          datetime: new Date(input.datetime),
          location: input.location,
          priceCents: input.priceCents,
          slots: input.slots,
          pixKey: input.pixKey ?? null,
          recurrenceRule: toRecurrenceRuleInput(input.recurrenceRule ?? null),
        },
      });
      return toDomainMatch(row);
    },

    async findById(id) {
      const row = await db.match.findUnique({ where: { id } });
      return row ? toDomainMatch(row) : null;
    },

    async listByGroup(groupId, opts) {
      const rows = await db.match.findMany({
        where: {
          groupId,
          ...(opts.includeFinished ? {} : { status: { not: "finished" } }),
        },
        orderBy: { datetime: "asc" },
      });
      return rows.map(toDomainMatch);
    },

    async update(id, patch) {
      const row = await db.match.update({
        where: { id },
        data: {
          ...(patch.datetime !== undefined ? { datetime: new Date(patch.datetime) } : {}),
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
          ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
          ...(patch.pixKey !== undefined ? { pixKey: patch.pixKey } : {}),
          ...(patch.recurrenceRule !== undefined
            ? { recurrenceRule: toRecurrenceRuleInput(patch.recurrenceRule) }
            : {}),
        },
      });
      return toDomainMatch(row);
    },

    async setStatus(id, status, tx) {
      const exec = tx ?? db;
      const row = await exec.match.update({ where: { id }, data: { status } });
      return toDomainMatch(row);
    },

    async findFinishedRecurringWithoutFutureSibling(now) {
      const candidates = await db.match.findMany({
        where: {
          status: "finished",
          recurrenceRule: { not: Prisma.JsonNull },
        },
      });
      if (candidates.length === 0) return [];

      const groupIds = [...new Set(candidates.map((c) => c.groupId))];
      const futureSiblings = await db.match.findMany({
        where: {
          groupId: { in: groupIds },
          datetime: { gt: now },
          status: { in: ["open", "full"] },
        },
        select: { groupId: true },
      });
      const groupsWithFutureSibling = new Set(futureSiblings.map((s) => s.groupId));

      return candidates.filter((c) => !groupsWithFutureSibling.has(c.groupId)).map(toDomainMatch);
    },

    async createNextOccurrence(from, datetime) {
      return repo.insert({
        groupId: from.groupId,
        datetime: datetime.toISOString(),
        location: from.location,
        priceCents: from.priceCents,
        slots: from.slots,
        pixKey: from.pixKey,
        recurrenceRule: from.recurrenceRule,
      });
    },
  };
  return repo;
}
