import type { SubscriptionsRepository } from "@/http/api/billing/subscription.repository";
import type { DuesRepository } from "@/http/api/dues/dues.repository";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { logger } from "@/infra/observability/logger";
import { verifyWooviSignature } from "@/infra/woovi/webhook";
import type { PaymentsRepository } from "../payments.repository";

export type WooviWebhookDeps = {
  paymentsRepo: PaymentsRepository;
  attendanceRepo: AttendanceRepository;
  duesRepo: DuesRepository;
  subscriptionsRepo: SubscriptionsRepository;
};

export type WooviWebhookInput = {
  rawBody: string;
  signature: string | undefined;
};

/** `{ ok: false }` means "bad signature" (the controller maps that to 401); `{ ok: true }` acks everything else, handled or not. */
export type WooviWebhookResult = { ok: boolean };

type ChargeCompletedEvent = {
  event: string;
  charge: { status: string; correlationID: string };
};

function isChargeCompletedEvent(value: unknown): value is ChargeCompletedEvent {
  if (typeof value !== "object" || value === null) return false;
  const { event, charge } = value as { event?: unknown; charge?: unknown };
  if (typeof event !== "string") return false;
  if (typeof charge !== "object" || charge === null) return false;
  const { status, correlationID } = charge as { status?: unknown; correlationID?: unknown };
  return typeof status === "string" && typeof correlationID === "string";
}

/**
 * PIX Automático (subscription) webhook payload — mirrors `createSubscription`'s
 * response shape (`src/infra/woovi/client.ts`): `subscription.correlationID`
 * (== our `Subscription.wooviCorrelationID`) and, when relevant,
 * `subscription.pixRecurring.recurrencyId`.
 */
type SubscriptionEvent = {
  event: string;
  subscription: {
    correlationID: string;
    pixRecurring?: { recurrencyId?: string | null };
  };
};

function isSubscriptionEvent(value: unknown): value is SubscriptionEvent {
  if (typeof value !== "object" || value === null) return false;
  const { event, subscription } = value as { event?: unknown; subscription?: unknown };
  if (typeof event !== "string") return false;
  if (typeof subscription !== "object" || subscription === null) return false;
  const { correlationID } = subscription as { correlationID?: unknown };
  return typeof correlationID === "string";
}

function addOneMonth(date: Date): Date {
  const until = new Date(date);
  until.setMonth(until.getMonth() + 1);
  return until;
}

/**
 * PIX Automático lifecycle branch — runs alongside `CHARGE_COMPLETED`
 * (Fase 1) in the same webhook handler, keyed by `subscription.correlationID`
 * instead of `charge.correlationID`. Unknown `correlationID` → no-op (not
 * ours, or a delivery for a `Subscription` we haven't created yet).
 *
 * Event names below: `PIX_AUTOMATIC_APPROVED` is confirmed by the Woovi docs
 * (design doc `2026-07-22-woovi-fase-3-assinaturas-design.md`). The other
 * three are NOT confirmed ("A confirmar com Woovi" in that doc) — each is
 * flagged `TODO(A confirmar)` with the naming convention it was guessed from,
 * so swapping in the real name later is a one-line change per branch.
 */
async function handleSubscriptionEvent(
  deps: WooviWebhookDeps,
  { event, subscription }: SubscriptionEvent,
): Promise<void> {
  const sub = await deps.subscriptionsRepo.findByCorrelationId(subscription.correlationID);
  if (!sub) return;

  if (event.endsWith("PIX_AUTOMATIC_APPROVED")) {
    // Idempotent: only flips from `pending` — a replay (or a delivery that
    // arrives after a later state change) is a no-op, never downgrades an
    // already-`active` (or `expired`/`canceled`) Subscription back to active.
    if (sub.status === "pending") {
      await deps.subscriptionsRepo.setActive(subscription.correlationID, {
        recurrencyId: subscription.pixRecurring?.recurrencyId ?? null,
      });
    }
    return;
  }

  // TODO(A confirmar): exact event name for "installment paid" isn't
  // confirmed in the docs available at implementation time. Guessed by
  // mirroring the CHARGE_CREATED → CHARGE_COMPLETED convention already used
  // for one-off charges: `PIX_AUTOMATIC_COBR_CREATED` is confirmed as
  // "installment scheduled", so its paid counterpart is assumed to be
  // `PIX_AUTOMATIC_COBR_COMPLETED`. Revalidate against the real Woovi
  // payload before relying on this in production.
  if (event.endsWith("PIX_AUTOMATIC_COBR_COMPLETED")) {
    // extendPeriod is monotonic-ish/harmless to re-apply (a replay just
    // re-sets currentPeriodEnd to ~now+1mo again) — no guard needed.
    await deps.subscriptionsRepo.extendPeriod(subscription.correlationID, addOneMonth(new Date()));
    return;
  }

  // TODO(A confirmar): exact event name for "expired" isn't confirmed either
  // — guessed as `PIX_AUTOMATIC_EXPIRED` (the design doc only names the
  // underlying state as "EXPIRED", not the webhook event).
  if (event.endsWith("PIX_AUTOMATIC_EXPIRED")) {
    if (sub.status !== "expired") await deps.subscriptionsRepo.setStatus(sub.id, "expired");
    return;
  }

  // TODO(A confirmar): exact event name for cancel/inactive isn't confirmed
  // — guessed as `PIX_AUTOMATIC_INACTIVATED`/`PIX_AUTOMATIC_CANCELED` (the
  // design doc names the underlying state as "INACTIVE (cancelada)").
  if (event.endsWith("PIX_AUTOMATIC_INACTIVATED") || event.endsWith("PIX_AUTOMATIC_CANCELED")) {
    if (sub.status !== "canceled") await deps.subscriptionsRepo.setStatus(sub.id, "canceled");
    return;
  }

  // Any other PIX_AUTOMATIC_* event (e.g. the confirmed
  // `PIX_AUTOMATIC_COBR_CREATED` — "installment scheduled", nothing to do
  // yet) — no-op, ack with 200 like everything else this handler ignores.
}

/**
 * `POST /webhooks/woovi`'s testable core (extracted so the HTTP layer stays a
 * thin adapter — mirrors `stripe-webhook.controller.ts`'s inline handling).
 * Handles two independent event families in the same handler: one-off PIX
 * charges (`*:CHARGE_COMPLETED`, Fase 1 — match_fee/membership_due) and PIX
 * Automático subscription lifecycle (`*:PIX_AUTOMATIC_*`, Fase 3 — see
 * `handleSubscriptionEvent` above).
 *
 * Verifies the HMAC signature first (`verifyWooviSignature`) — `{ ok: false }`
 * on failure, which the controller turns into a 401. Anything else acks with
 * `{ ok: true }`, including events this handler doesn't act on (malformed
 * JSON, a different event type, an unknown `correlationID`) — Woovi should
 * never retry those.
 *
 * Only `*:CHARGE_COMPLETED` events with `charge.status === "COMPLETED"` do
 * anything: `findByCorrelationId` resolves the `Payment` this charge belongs
 * to. Missing → no-op (unknown `correlationID`, nothing to apply).
 * Otherwise `markCompleted` (itself guarded on `status: "pending"`, see
 * `payments.repository.ts`) flips the status — its `count` is informational
 * only (logged when 0, meaning this delivery didn't win the flip: either a
 * concurrent delivery of the same event raced it, or this is a Woovi retry
 * of an already-completed charge).
 *
 * Critically, the paid effect below is applied UNCONDITIONALLY whenever
 * `payment` exists, regardless of `count` or `payment.status` — it is NOT
 * gated behind "this delivery was the one that flipped the status". Both
 * `attendanceRepo.setPayment(..., "paid", null)` and
 * `duesRepo.setStatus(..., "paid", null)` are idempotent writes (setting an
 * already-`"paid"` row to `"paid"` again is a harmless no-op), so
 * re-applying them on every replay is safe. This is what closes the
 * exactly-once gap `markCompleted`+effect used to have as two separate
 * non-transactional writes: if the effect write throws AFTER `markCompleted`
 * already committed, the `Payment` is left `"completed"` while the
 * attendance/due is still `"pending"`. Because there is no early-return on
 * `payment.status === "completed"`, Woovi's automatic retry of that same
 * `CHARGE_COMPLETED` delivery reaches this code again, `markCompleted` is a
 * no-op (`count: 0`, already completed), but the effect IS re-run and
 * recovers the stuck `"pending"` row. Net invariant: after any successful
 * (2xx) processing of a `CHARGE_COMPLETED` for a known `Payment`, the linked
 * attendance/due ends up `"paid"` — never permanently stuck `"pending"`.
 * `null` in both effect calls because no human confirmed it — Woovi did.
 */
export function createHandleWooviWebhook(deps: WooviWebhookDeps) {
  return async ({ rawBody, signature }: WooviWebhookInput): Promise<WooviWebhookResult> => {
    if (!verifyWooviSignature(rawBody, signature)) return { ok: false };

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      logger.warn({ err: error }, "woovi-webhook: malformed JSON body (signature was valid)");
      return { ok: true };
    }

    if (isChargeCompletedEvent(parsed)) {
      const { event, charge } = parsed;
      if (event.endsWith("CHARGE_COMPLETED") && charge.status === "COMPLETED") {
        const payment = await deps.paymentsRepo.findByCorrelationId(charge.correlationID);
        if (payment) {
          const { count } = await deps.paymentsRepo.markCompleted(
            payment.correlationID,
            new Date(),
          );
          if (count === 0) {
            logger.info(
              { correlationID: payment.correlationID },
              "woovi-webhook: CHARGE_COMPLETED replay (Payment already completed) — reapplying paid effect idempotently to recover any partial failure",
            );
          }

          // Unconditional (not gated on `count`/`payment.status`) — see the
          // exactly-once invariant explained above.
          if (payment.kind === "match_fee" && payment.attendanceId) {
            await deps.attendanceRepo.setPayment(payment.attendanceId, "paid", null);
          } else if (payment.kind === "membership_due" && payment.membershipDueId) {
            await deps.duesRepo.setStatus(payment.membershipDueId, "paid", null);
          }
        }
      }
      return { ok: true };
    }

    // PIX Automático (subscription) lifecycle — see `handleSubscriptionEvent`
    // above for the event-name caveats.
    if (isSubscriptionEvent(parsed)) {
      await handleSubscriptionEvent(deps, parsed);
    }

    return { ok: true };
  };
}
