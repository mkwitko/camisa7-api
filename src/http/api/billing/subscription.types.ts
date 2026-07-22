import type { PlanKey } from "./billing.catalog";

/**
 * Domain `SubscriptionStatus` — mirrors the Prisma `SubscriptionStatus`
 * enum values as a plain string union (same rationale as `PaymentStatus`/
 * `MatchStatus` elsewhere: callers don't depend on the generated Prisma
 * client's types). `pending` right after `create` (Woovi subscription
 * created, QR not yet approved); `active` once the `PIX_AUTOMATIC_APPROVED`
 * webhook lands; `expired` on a lapsed installment (`EXPIRED`); `canceled`
 * when the user cancels or a resubscribe replaces the previous row.
 */
export type SubscriptionStatus = "pending" | "active" | "expired" | "canceled";

/**
 * Domain `Subscription` — not the Prisma row. One Woovi PIX Automático
 * subscription for a `plan` (`PlanKey`). `id` doubles as
 * `wooviCorrelationID` (sent to Woovi's `subscriptions.create`, comes back
 * unchanged on webhook events — same correlation-id convention as
 * `Payment`). `recurrencyId` is Woovi's `pixRecurring.recurrencyId`, null
 * until the create call responds. `currentPeriodEnd` is null until the
 * first installment is confirmed paid, then advances ~1 month per renewal.
 * "Assinatura ativa do usuário" = the most recent row with `status =
 * active` AND (`currentPeriodEnd` null OR in the future) — see
 * `findActiveByUser`.
 */
export type Subscription = {
  id: string;
  userId: string;
  plan: PlanKey;
  status: SubscriptionStatus;
  wooviCorrelationID: string;
  recurrencyId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
};
