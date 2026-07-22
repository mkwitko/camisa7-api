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
 * to. Missing, or already `completed` (a retried delivery) → no-op. Otherwise
 * `markCompleted` (itself guarded on `status: "pending"`, see
 * `payments.repository.ts`) — its `count` is checked too, so a race against a
 * concurrent delivery of the same event (both pass the `findByCorrelationId`
 * check before either commits) still only applies the side effect once: the
 * loser sees `count: 0` and stops there. The winner applies the effect by
 * `payment.kind` — `match_fee` marks the `Attendance` paid
 * (`attendanceRepo.setPayment(..., "paid", null)`, `null` because no human
 * confirmed it — Woovi did), `membership_due` marks the `MembershipDue` paid
 * (`duesRepo.setStatus(..., "paid", null)`).
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
    if (!payment || payment.status === "completed") return { ok: true };

    const { count } = await deps.paymentsRepo.markCompleted(payment.correlationID, new Date());
    if (count === 0) return { ok: true };

    if (payment.kind === "match_fee" && payment.attendanceId) {
      await deps.attendanceRepo.setPayment(payment.attendanceId, "paid", null);
    } else if (payment.kind === "membership_due" && payment.membershipDueId) {
      await deps.duesRepo.setStatus(payment.membershipDueId, "paid", null);
    }

    return { ok: true };
  };
}
