import type { DuesRepository } from "@/http/api/dues/dues.repository";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { logger } from "@/infra/observability/logger";
import { verifyWooviSignature } from "@/infra/woovi/webhook";
import type { PaymentsRepository } from "../payments.repository";

export type WooviWebhookDeps = {
  paymentsRepo: PaymentsRepository;
  attendanceRepo: AttendanceRepository;
  duesRepo: DuesRepository;
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
 * `POST /webhooks/woovi`'s testable core (extracted so the HTTP layer stays a
 * thin adapter — mirrors `stripe-webhook.controller.ts`'s inline handling,
 * but Woovi's simpler single-event-type contract makes a standalone service
 * worth it here).
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

    if (!isChargeCompletedEvent(parsed)) return { ok: true };
    const { event, charge } = parsed;
    if (!event.endsWith("CHARGE_COMPLETED") || charge.status !== "COMPLETED") {
      return { ok: true };
    }

    const payment = await deps.paymentsRepo.findByCorrelationId(charge.correlationID);
    if (!payment) return { ok: true };

    const { count } = await deps.paymentsRepo.markCompleted(payment.correlationID, new Date());
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

    return { ok: true };
  };
}
