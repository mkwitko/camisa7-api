import type { BillingMode } from "@/http/api/dues/dues.types";
import { type SkillKey, withAttributeDefaults } from "@/http/api/players/players.catalog";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import type { PrismaLike } from "@/infra/db/client";
import type { GroupMember, MemberRole, Position } from "./members.types";

type MemberRow = {
  id: string;
  groupId: string;
  role: string;
  primaryPos: string | null;
  secondaryPos: string[];
  affinity: unknown;
  seedOverall: unknown;
  billingMode: string;
  monthlyFeeCentsOverride: number | null;
  player: {
    id: string;
    userId: string | null;
    name: string;
    phone: string | null;
    affinity: unknown;
    attributes: unknown;
    skills: string[];
  };
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
      avatarUrl: null,
      affinity: (row.player.affinity ?? {}) as Record<string, number>,
      attributes: withAttributeDefaults((row.player.attributes ?? {}) as Record<string, number>),
      skills: (row.player.skills ?? []) as SkillKey[],
      dominantFoot: null,
      weakFoot: null,
      skillMoves: null,
      heightCm: null,
      weightKg: null,
      birthYear: null,
      preferredTeam: null,
      nationality: null,
    },
    role: row.role as MemberRole,
    primaryPos: row.primaryPos as Position | null,
    secondaryPos: row.secondaryPos as Position[],
    affinity: (row.affinity ?? {}) as Record<string, number>,
    seedOverall: (row.seedOverall ?? {}) as Record<string, number>,
    billingMode: row.billingMode as BillingMode,
    monthlyFeeCentsOverride: row.monthlyFeeCentsOverride,
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
  /**
   * Task 1 (UX overhaul): the organizer no longer sets the new member's
   * rating at add-member time — `primaryPos`/`secondaryPos`/`affinity`/
   * `seedOverall` all fall back to the `GroupMember` row's own DB defaults
   * (`null`/`[]`/`{}`/`{}`). An owner rates the member later via
   * `PATCH .../members/:memberId` (`updateRating`).
   */
  billingMode?: BillingMode | undefined;
};

export type UpdateRatingPatch = {
  primaryPos?: Position | undefined;
  secondaryPos?: Position[] | undefined;
  affinity?: Record<string, number> | undefined;
  seedOverall?: Record<string, number> | undefined;
  billingMode?: BillingMode | undefined;
  /**
   * `null` explicitly clears the member's override (falls back to
   * `Group.monthlyFeeCents`); `undefined` (not provided) leaves it
   * untouched — the `update` service/repo both distinguish the two via
   * `!== undefined` rather than truthiness.
   */
  monthlyFeeCentsOverride?: number | null | undefined;
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
  /**
   * Looks up a member by `(groupId, playerId)` rather than the member's own
   * `id` (unlike `findInGroup`) — the F1-4 career-growth engine resolves a
   * match's group membership from a `Player` id (via the match's
   * `groupId` + the stat/attendance row's `playerId`), never from a
   * `GroupMember` id it doesn't have. Feeds the engine's bootstrap
   * (`seedOverall`) and the position(s) (`primaryPos`/`secondaryPos`) whose
   * `overall` a finalized match nudges.
   */
  findByGroupAndPlayer(groupId: string, playerId: string): Promise<GroupMember | null>;
  updateRating(memberId: string, patch: UpdateRatingPatch): Promise<GroupMember>;
  /**
   * True iff `userId` has a `GroupMember` row in `groupId` (their `Player`'s
   * `userId` matches — same join `findInGroup` does via `player: true`, just
   * a boolean existence check). Used by `list-attendance`'s authz: any
   * member of the match's group (not just the owner) may view the roster.
   */
  isUserInGroup(groupId: string, userId: string): Promise<boolean>;
}

/**
 * Auto-added `organizador` members (Task 5's `create-group` transaction) get
 * no position input from the caller (only `name`/`statsMode` are collected
 * at group creation) — `meia` (midfielder) is the neutral default seeded
 * onto their `GroupMember` row so the balancer has something to work with
 * immediately; the owner can set their real rating later via
 * `PATCH .../members/:memberId` (this same `updateRating`). Since Task 1
 * (UX overhaul), `primaryPos` is nullable on `GroupMember`, but this
 * auto-added path still seeds it rather than leaving it `null` — unlike
 * `addGuest`, which now leaves a freshly added member entirely unrated.
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
            ...(input.billingMode !== undefined ? { billingMode: input.billingMode } : {}),
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

    async findByGroupAndPlayer(groupId, playerId) {
      const row = await db.groupMember.findFirst({
        where: { groupId, playerId },
        include: MEMBER_INCLUDE,
      });
      return row ? toDomainMember(row) : null;
    },

    async isUserInGroup(groupId, userId) {
      const row = await db.groupMember.findFirst({
        where: { groupId, player: { userId } },
        select: { id: true },
      });
      return row !== null;
    },

    async updateRating(memberId, patch) {
      const row = await db.groupMember.update({
        where: { id: memberId },
        data: {
          ...(patch.primaryPos !== undefined ? { primaryPos: patch.primaryPos } : {}),
          ...(patch.secondaryPos !== undefined ? { secondaryPos: patch.secondaryPos } : {}),
          ...(patch.affinity !== undefined ? { affinity: patch.affinity } : {}),
          ...(patch.seedOverall !== undefined ? { seedOverall: patch.seedOverall } : {}),
          ...(patch.billingMode !== undefined ? { billingMode: patch.billingMode } : {}),
          ...(patch.monthlyFeeCentsOverride !== undefined
            ? { monthlyFeeCentsOverride: patch.monthlyFeeCentsOverride }
            : {}),
        },
        include: MEMBER_INCLUDE,
      });
      return toDomainMember(row);
    },
  };
}
