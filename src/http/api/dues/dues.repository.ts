import type { PrismaLike } from "@/infra/db/client";
import type { DueProvider, DueStatus, MembershipDue } from "./dues.types";

type DueRow = {
  id: string;
  groupMemberId: string;
  competencyMonth: string;
  amountCents: number;
  status: string;
  paidConfirmedById: string | null;
  provider: string;
  externalRef: string | null;
  createdAt: Date;
};

function toDomainDue(row: DueRow): MembershipDue {
  return {
    id: row.id,
    groupMemberId: row.groupMemberId,
    competencyMonth: row.competencyMonth,
    amountCents: row.amountCents,
    status: row.status as DueStatus,
    paidConfirmedById: row.paidConfirmedById,
    provider: row.provider as DueProvider,
    externalRef: row.externalRef,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface DuesRepository {
  findById(id: string): Promise<MembershipDue | null>;
  /** Dues of `mensalista` members of `groupId` for `month` ("YYYY-MM") — joins via `groupMember.groupId`. */
  listByGroupMonth(groupId: string, month: string): Promise<MembershipDue[]>;
  /** All dues of a player across groups — joins via `groupMember.playerId`. Newest competency first. */
  listByPlayer(playerId: string): Promise<MembershipDue[]>;
  setStatus(
    id: string,
    status: DueStatus,
    paidConfirmedById: string | null,
  ): Promise<MembershipDue>;
  /**
   * Idempotent upsert keyed by `@@unique([groupMemberId, competencyMonth])`.
   * The `update` clause is intentionally empty: a due that already exists is
   * left untouched (its `amountCents`/`status` are never overwritten by a
   * later re-run of the monthly-generation job).
   */
  ensureForMember(
    groupMemberId: string,
    month: string,
    amountCents: number,
  ): Promise<MembershipDue>;
  /**
   * `mensalista` members whose fee resolves to a non-null value
   * (`monthlyFeeCentsOverride ?? group.monthlyFeeCents`) — members without a
   * resolvable fee are excluded. Feeds the monthly-dues generation job.
   *
   * NOTE: the schema has no `Group.status`/"active" concept (verified
   * against `prisma/schema.prisma` — no `GroupStatus` enum exists), so this
   * does not filter by group status, unlike earlier task notes assumed.
   */
  listActiveMensalistaMembers(): Promise<
    { groupMemberId: string; groupId: string; amountCents: number }[]
  >;
}

/** Factory `createDuesRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createDuesRepository(db: PrismaLike): DuesRepository {
  return {
    async findById(id) {
      const row = await db.membershipDue.findUnique({ where: { id } });
      return row ? toDomainDue(row) : null;
    },

    async listByGroupMonth(groupId, month) {
      const rows = await db.membershipDue.findMany({
        where: { competencyMonth: month, groupMember: { groupId } },
      });
      return rows.map(toDomainDue);
    },

    async listByPlayer(playerId) {
      const rows = await db.membershipDue.findMany({
        where: { groupMember: { playerId } },
        orderBy: { competencyMonth: "desc" },
      });
      return rows.map(toDomainDue);
    },

    async setStatus(id, status, paidConfirmedById) {
      const row = await db.membershipDue.update({
        where: { id },
        data: { status, paidConfirmedById },
      });
      return toDomainDue(row);
    },

    async ensureForMember(groupMemberId, month, amountCents) {
      const row = await db.membershipDue.upsert({
        where: { groupMemberId_competencyMonth: { groupMemberId, competencyMonth: month } },
        create: {
          groupMemberId,
          competencyMonth: month,
          amountCents,
          status: "pending",
          provider: "manual",
        },
        update: {},
      });
      return toDomainDue(row);
    },

    async listActiveMensalistaMembers() {
      const rows = await db.groupMember.findMany({
        where: { billingMode: "mensalista" },
        select: {
          id: true,
          groupId: true,
          monthlyFeeCentsOverride: true,
          group: { select: { monthlyFeeCents: true } },
        },
      });
      const members: { groupMemberId: string; groupId: string; amountCents: number }[] = [];
      for (const row of rows) {
        const amountCents = row.monthlyFeeCentsOverride ?? row.group.monthlyFeeCents;
        if (amountCents === null) continue;
        members.push({ groupMemberId: row.id, groupId: row.groupId, amountCents });
      }
      return members;
    },
  };
}
