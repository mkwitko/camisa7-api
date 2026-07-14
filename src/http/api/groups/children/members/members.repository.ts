import { createPlayersRepository } from "@/http/api/players/players.repository";
import type { PrismaLike } from "@/infra/db/client";
import type { GroupMember, MemberRole, Position } from "./members.types";

type MemberRow = {
  id: string;
  groupId: string;
  role: string;
  primaryPos: string;
  secondaryPos: string[];
  affinity: unknown;
  seedOverall: unknown;
  player: { id: string; userId: string | null; name: string; phone: string | null };
};

function toDomainMember(row: MemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.groupId,
    player: {
      id: row.player.id,
      userId: row.player.userId,
      name: row.player.name,
      phone: row.player.phone,
    },
    role: row.role as MemberRole,
    primaryPos: row.primaryPos as Position,
    secondaryPos: row.secondaryPos as Position[],
    affinity: (row.affinity ?? {}) as Record<string, number>,
    seedOverall: (row.seedOverall ?? {}) as Record<string, number>,
  };
}

const MEMBER_INCLUDE = { player: true } as const;

// Optional fields are explicitly typed `| undefined` (rather than relying on
// `Partial<...>`) so this composes with `exactOptionalPropertyTypes: true` —
// the Zod `.optional()` fields these are built from carry that same
// explicit-`undefined` shape (an absent field vs. a field never provided are
// otherwise indistinguishable at this strictness level).
export type AddGuestInput = {
  name: string;
  phone?: string | null | undefined;
  primaryPos: Position;
  secondaryPos?: Position[] | undefined;
  affinity?: Record<string, number> | undefined;
  seedOverall?: Record<string, number> | undefined;
};

export type UpdateRatingPatch = {
  primaryPos?: Position | undefined;
  secondaryPos?: Position[] | undefined;
  affinity?: Record<string, number> | undefined;
  seedOverall?: Record<string, number> | undefined;
};

export interface MembersRepository {
  addGuest(groupId: string, input: AddGuestInput): Promise<GroupMember>;
  addForUser(
    groupId: string,
    userId: string,
    role: MemberRole,
    tx?: PrismaLike,
  ): Promise<GroupMember>;
  listByGroup(groupId: string): Promise<GroupMember[]>;
  findInGroup(groupId: string, memberId: string): Promise<GroupMember | null>;
  updateRating(memberId: string, patch: UpdateRatingPatch): Promise<GroupMember>;
}

/**
 * Auto-added `organizador` members (Task 5's `create-group` transaction) get
 * no position input from the caller (only `name`/`statsMode` are collected
 * at group creation) but `primaryPos` is a required column — `meia`
 * (midfielder) is the neutral default; the owner sets their real position
 * later via `PATCH .../members/:memberId` (this same `updateRating`).
 */
const DEFAULT_PRIMARY_POS: Position = "meia";

/**
 * Runs a (possibly multi-statement) write atomically: if `tx` is given, the
 * caller already owns a transaction — just run against it. Otherwise, if
 * `db` is the base client (has `$transaction`), open one. If `db` is itself
 * already a `Prisma.TransactionClient` (composed inside a parent tx) with no
 * explicit `tx` override, run directly against it — it's already atomic as
 * part of that parent transaction.
 */
async function runAtomic<T>(
  db: PrismaLike,
  tx: PrismaLike | undefined,
  fn: (exec: PrismaLike) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx);
  if ("$transaction" in db) return db.$transaction((innerTx) => fn(innerTx));
  return fn(db);
}

/** Factory `createMembersRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMembersRepository(db: PrismaLike): MembersRepository {
  return {
    async addGuest(groupId, input) {
      return runAtomic(db, undefined, async (exec) => {
        const player = await createPlayersRepository(exec).createGuest({
          name: input.name,
          phone: input.phone ?? null,
        });
        const row = await exec.groupMember.create({
          data: {
            groupId,
            playerId: player.id,
            role: "jogador",
            primaryPos: input.primaryPos,
            secondaryPos: input.secondaryPos ?? [],
            affinity: input.affinity ?? {},
            seedOverall: input.seedOverall ?? {},
          },
          include: MEMBER_INCLUDE,
        });
        return toDomainMember(row);
      });
    },

    async addForUser(groupId, userId, role, tx) {
      return runAtomic(db, tx, async (exec) => {
        const player = await createPlayersRepository(exec).findOrCreateForUser(userId);
        const row = await exec.groupMember.create({
          data: {
            groupId,
            playerId: player.id,
            role,
            primaryPos: DEFAULT_PRIMARY_POS,
            secondaryPos: [],
            affinity: {},
            seedOverall: {},
          },
          include: MEMBER_INCLUDE,
        });
        return toDomainMember(row);
      });
    },

    async listByGroup(groupId) {
      const rows = await db.groupMember.findMany({
        where: { groupId },
        include: MEMBER_INCLUDE,
        orderBy: { player: { name: "asc" } },
      });
      return rows.map(toDomainMember);
    },

    async findInGroup(groupId, memberId) {
      const row = await db.groupMember.findFirst({
        where: { id: memberId, groupId },
        include: MEMBER_INCLUDE,
      });
      return row ? toDomainMember(row) : null;
    },

    async updateRating(memberId, patch) {
      const row = await db.groupMember.update({
        where: { id: memberId },
        data: {
          ...(patch.primaryPos !== undefined ? { primaryPos: patch.primaryPos } : {}),
          ...(patch.secondaryPos !== undefined ? { secondaryPos: patch.secondaryPos } : {}),
          ...(patch.affinity !== undefined ? { affinity: patch.affinity } : {}),
          ...(patch.seedOverall !== undefined ? { seedOverall: patch.seedOverall } : {}),
        },
        include: MEMBER_INCLUDE,
      });
      return toDomainMember(row);
    },
  };
}
