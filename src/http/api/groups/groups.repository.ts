import type { PrismaLike } from "@/infra/db/client";
import type { Group, GroupStatsMode } from "./groups.types";

type GroupRow = {
  id: string;
  name: string;
  ownerId: string;
  statsMode: GroupStatsMode;
  createdAt: Date;
};

function toDomainGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    statsMode: row.statsMode,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface GroupsRepository {
  insert(input: { name: string; statsMode: GroupStatsMode; ownerId: string }): Promise<Group>;
  findById(id: string): Promise<Group | null>;
  listOwnedBy(ownerId: string): Promise<Group[]>;
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

    async listOwnedBy(ownerId) {
      const rows = await db.group.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toDomainGroup);
    },
  };
}
