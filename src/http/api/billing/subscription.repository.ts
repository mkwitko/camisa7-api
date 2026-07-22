import { randomUUID } from "node:crypto";
import type { PrismaLike } from "@/infra/db/client";
import type { PlanKey } from "./billing.catalog";
import type { Subscription, SubscriptionStatus } from "./subscription.types";

type SubscriptionRow = {
  id: string;
  userId: string;
  plan: string;
  status: string;
  wooviCorrelationID: string;
  recurrencyId: string | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomainSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    plan: row.plan as PlanKey,
    status: row.status as SubscriptionStatus,
    wooviCorrelationID: row.wooviCorrelationID,
    recurrencyId: row.recurrencyId,
    currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CreateSubscriptionInput = {
  userId: string;
  plan: PlanKey;
};

/**
 * Optional extra fields `setStatus` can update alongside `status` in the
 * same write — e.g. the webhook handler setting `active` + `recurrencyId`
 * in one call instead of two (`setActive` covers that common case; `patch`
 * exists for anything else that needs to move together with a status
 * change).
 */
export type SetStatusPatch = {
  recurrencyId?: string | null;
  currentPeriodEnd?: Date | null;
};

export interface SubscriptionsRepository {
  /**
   * Inserts a new `Subscription` with `wooviCorrelationID` set equal to its
   * own `id` — both minted here (`randomUUID()`, not the DB's
   * `@default(uuid())`) so the caller can hand `wooviCorrelationID` to
   * Woovi's `subscriptions.create` in the same call that creates the row.
   * Starts `pending`, with `recurrencyId`/`currentPeriodEnd` both `null`.
   */
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  /**
   * The user's active subscription — the most recent `Subscription` with
   * `status = "active"` AND (`currentPeriodEnd` null OR in the future).
   * `null` if the user has none (never subscribed, or the active one has
   * lapsed past its `currentPeriodEnd`).
   */
  findActiveByUser(userId: string): Promise<Subscription | null>;
  findByCorrelationId(wooviCorrelationID: string): Promise<Subscription | null>;
  /**
   * The user's most recent `Subscription` regardless of status — used to
   * find a `pending`/`active` row to cancel before creating a fresh one on
   * resubscribe (see design doc's `POST /billing/subscribe`).
   */
  findLatestByUser(userId: string): Promise<Subscription | null>;
  /** Updates `status`, optionally alongside `recurrencyId`/`currentPeriodEnd` in the same write (see `SetStatusPatch`). */
  setStatus(id: string, status: SubscriptionStatus, patch?: SetStatusPatch): Promise<Subscription>;
  /**
   * Marks the `Subscription` (looked up by `wooviCorrelationID`) `active` —
   * the `PIX_AUTOMATIC_APPROVED` webhook's effect. `recurrencyId` is only
   * written when truthy: a `null`/empty value in `input` (the webhook payload
   * omitting `pixRecurring.recurrencyId`) is coalesced away rather than
   * clobbering whatever `recurrencyId` was already stored at subscribe time.
   */
  setActive(
    wooviCorrelationID: string,
    input: { recurrencyId: string | null },
  ): Promise<Subscription>;
  /** Advances `currentPeriodEnd` (looked up by `wooviCorrelationID`) — a paid installment's renewal effect. */
  extendPeriod(wooviCorrelationID: string, until: Date): Promise<Subscription>;
}

/** Factory `createSubscriptionsRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createSubscriptionsRepository(db: PrismaLike): SubscriptionsRepository {
  return {
    async create(input) {
      const id = randomUUID();
      const row = await db.subscription.create({
        data: {
          id,
          userId: input.userId,
          plan: input.plan,
          status: "pending",
          wooviCorrelationID: id,
          recurrencyId: null,
          currentPeriodEnd: null,
        },
      });
      return toDomainSubscription(row);
    },

    async findActiveByUser(userId) {
      const now = new Date();
      const row = await db.subscription.findFirst({
        where: {
          userId,
          status: "active",
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
        },
        orderBy: { createdAt: "desc" },
      });
      return row ? toDomainSubscription(row) : null;
    },

    async findByCorrelationId(wooviCorrelationID) {
      const row = await db.subscription.findUnique({ where: { wooviCorrelationID } });
      return row ? toDomainSubscription(row) : null;
    },

    async findLatestByUser(userId) {
      const row = await db.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return row ? toDomainSubscription(row) : null;
    },

    async setStatus(id, status, patch) {
      const row = await db.subscription.update({
        where: { id },
        data: {
          status,
          ...(patch?.recurrencyId !== undefined ? { recurrencyId: patch.recurrencyId } : {}),
          ...(patch?.currentPeriodEnd !== undefined
            ? { currentPeriodEnd: patch.currentPeriodEnd }
            : {}),
        },
      });
      return toDomainSubscription(row);
    },

    async setActive(wooviCorrelationID, input) {
      const row = await db.subscription.update({
        where: { wooviCorrelationID },
        data: {
          status: "active",
          ...(input.recurrencyId ? { recurrencyId: input.recurrencyId } : {}),
        },
      });
      return toDomainSubscription(row);
    },

    async extendPeriod(wooviCorrelationID, until) {
      const row = await db.subscription.update({
        where: { wooviCorrelationID },
        data: { currentPeriodEnd: until },
      });
      return toDomainSubscription(row);
    },
  };
}
