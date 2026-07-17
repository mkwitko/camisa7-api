import type { PrismaLike } from "@/infra/db/client";
import type { Group, GroupNextMatch, GroupStatsMode, GroupWithMeta, JoinPolicy } from "./groups.types";

type GroupRow = {
  id: string;
  name: string;
  ownerId: string;
  statsMode: GroupStatsMode;
  monthlyFeeCents: number | null;
  isPublic: boolean;
  joinPolicy: JoinPolicy;
  createdAt: Date;
};

function toDomainGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    statsMode: row.statsMode,
    monthlyFeeCents: row.monthlyFeeCents,
    isPublic: row.isPublic,
    joinPolicy: row.joinPolicy,
    createdAt: row.createdAt.toISOString(),
  };
}

export type UpdateGroupPatch = {
  /**
   * `null` explicitly clears the group's default fee (members fall back to
   * no default unless they carry their own `monthlyFeeCentsOverride`);
   * `undefined` (not provided) leaves it untouched — `update` distinguishes
   * the two via `!== undefined` rather than truthiness.
   */
  monthlyFeeCents?: number | null | undefined;
  /** Geo G3: toggle discovery visibility (gated by `public_groups` in the service). */
  isPublic?: boolean | undefined;
  /** Geo G3: how strangers join this group's public matches. */
  joinPolicy?: JoinPolicy | undefined;
};

export interface GroupsRepository {
  insert(input: { name: string; statsMode: GroupStatsMode; ownerId: string }): Promise<Group>;
  findById(id: string): Promise<Group | null>;
  update(id: string, patch: UpdateGroupPatch): Promise<Group>;
  listOwnedBy(ownerId: string): Promise<Group[]>;
  /**
   * Same rows as `listOwnedBy`, enriched with `memberCount` and `nextMatch`
   * for `list-my-groups` — kept as its own method rather than an option on
   * `listOwnedBy` since it always runs the extra queries, and no other
   * caller needs the enrichment. Two queries total regardless of how many
   * groups the owner has: one for the groups themselves (with a Prisma
   * `_count` on `members`, no N+1), one for every candidate upcoming match
   * across all of them at once, reduced client-side to the soonest per
   * group.
   */
  listOwnedByWithMeta(ownerId: string): Promise<GroupWithMeta[]>;
}

/** Factory `createGroupsRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createGroupsRepository(db: PrismaLike): GroupsRepository {
  return {
    async insert(input) {
      const row = await db.group.create({
        data: {
          name: input.name,
          statsMode: input.statsMode,
          ownerId: input.ownerId,
        },
      });
      return toDomainGroup(row);
    },

    async findById(id) {
      const row = await db.group.findUnique({ where: { id } });
      return row ? toDomainGroup(row) : null;
    },

    async update(id, patch) {
      const row = await db.group.update({
        where: { id },
        data: {
          ...(patch.monthlyFeeCents !== undefined
            ? { monthlyFeeCents: patch.monthlyFeeCents }
            : {}),
          ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
          ...(patch.joinPolicy !== undefined ? { joinPolicy: patch.joinPolicy } : {}),
        },
      });
      return toDomainGroup(row);
    },

    async listOwnedBy(ownerId) {
      const rows = await db.group.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toDomainGroup);
    },

    async listOwnedByWithMeta(ownerId) {
      const rows = await db.group.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { members: true } } },
      });
      if (rows.length === 0) return [];

      const groupIds = rows.map((r) => r.id);
      // Ordered soonest-first so the first match seen per groupId (below) is
      // its next match — one query for every group's candidates at once
      // instead of one query per group.
      const upcoming = await db.match.findMany({
        where: {
          groupId: { in: groupIds },
          datetime: { gt: new Date() },
          status: { in: ["open", "full"] },
        },
        orderBy: { datetime: "asc" },
        select: { id: true, groupId: true, datetime: true, location: true },
      });
      const nextMatchByGroupId = new Map<string, GroupNextMatch>();
      for (const m of upcoming) {
        if (nextMatchByGroupId.has(m.groupId)) continue;
        nextMatchByGroupId.set(m.groupId, {
          id: m.id,
          datetime: m.datetime.toISOString(),
          location: m.location,
        });
      }

      return rows.map((row) => ({
        ...toDomainGroup(row),
        memberCount: row._count.members,
        nextMatch: nextMatchByGroupId.get(row.id) ?? null,
      }));
    },
  };
}
