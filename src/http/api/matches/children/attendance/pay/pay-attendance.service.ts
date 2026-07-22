import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { PaymentsRepository } from "@/http/api/payments/payments.repository";
import type { Payment } from "@/http/api/payments/payments.types";
import { createCharge, isWooviConfigured } from "@/infra/woovi/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { PayAttendanceResponse } from "./pay-attendance.schema";

export type PayAttendanceDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  paymentsRepo: PaymentsRepository;
};

function presentPayment(payment: Payment): PayAttendanceResponse {
  return {
    paymentId: payment.id,
    status: payment.status,
    brCode: payment.brCode,
    qrCodeImage: payment.qrCodeImage,
    paymentLinkUrl: payment.paymentLinkUrl,
  };
}

/**
 * `POST /matches/:id/attendance/:attId/pay` — mints (or reuses) the Woovi PIX
 * charge for one attendee's per-match fee. Self-only: unlike
 * `cancel-presence`/`mark-paid`, there's no group-owner override here — the
 * organizer never pays on someone else's behalf, so a mismatched
 * `attendance.player.userId` is a flat `ATT-T0003` (`ERRORS.ATT.CANNOT_MANAGE`,
 * 403), same code the module already uses for "you have no standing over
 * this attendance".
 *
 * Guard order mirrors the brief exactly: config gate first (`WOO.DISABLED`,
 * 503, before touching the DB at all), then match existence, then the
 * match-level "is this even payable" check (`priceCents <= 0` →
 * `WOO.NOT_PAYABLE`), then the attendance lookup/ownership, then the
 * attendance-level payable check (must be `confirmed` — a waitlisted or
 * cancelled attendee has nothing to pay for), and finally the group's Woovi
 * subaccount (`wooviPixKey` unset → `WOO.NO_SUBACCOUNT`, the organizer hasn't
 * onboarded yet).
 *
 * Idempotent: a `pending` `Payment` already open for this attendance
 * (`findPendingByAttendance`) is returned as-is — no second `createCharge`
 * call, no duplicate PIX charge minted at Woovi. Otherwise a fresh `Payment`
 * row is inserted first (`create` mints `id === correlationID`), then
 * `createCharge` is called with that `correlationID`, and the response
 * (`brCode`/`qrCodeImage`/`paymentLinkUrl`) is persisted back via
 * `attachCharge`.
 *
 * create→charge is a critical section: if `createCharge` (or `attachCharge`)
 * throws — e.g. a Woovi outage — the just-inserted `Payment` is deleted
 * (`deleteById`) before rethrowing, so no broken `pending` row with an empty
 * `brCode`/`qrCodeImage` is left for `findPendingByAttendance` to return
 * forever. `pay-due` (Task 6) mirrors this same create-then-charge-with-
 * cleanup pattern.
 */
export function createPayAttendanceService(deps: PayAttendanceDeps) {
  return async (
    matchId: string,
    attendanceId: string,
    userId: string,
  ): Promise<PayAttendanceResponse> => {
    if (!isWooviConfigured) throw ERRORS.WOO.DISABLED();

    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();
    if (match.priceCents <= 0) throw ERRORS.WOO.NOT_PAYABLE();

    const attendance = await deps.attendanceRepo.findById(matchId, attendanceId);
    if (!attendance) throw ERRORS.ATT.NOT_FOUND();
    if (attendance.player.userId !== userId) throw ERRORS.ATT.CANNOT_MANAGE();
    if (attendance.status !== "confirmed") throw ERRORS.WOO.NOT_PAYABLE();

    const group = await deps.groupsRepo.findById(match.groupId);
    if (!group?.wooviPixKey) throw ERRORS.WOO.NO_SUBACCOUNT();

    const existing = await deps.paymentsRepo.findPendingByAttendance(attendance.id);
    if (existing) return presentPayment(existing);

    const payment = await deps.paymentsRepo.create({
      kind: "match_fee",
      valueCents: match.priceCents,
      subaccountPixKey: group.wooviPixKey,
      attendanceId: attendance.id,
    });

    try {
      const charge = await createCharge({
        correlationID: payment.correlationID,
        value: match.priceCents,
        subaccount: group.wooviPixKey,
        comment: `Pelada ${group.name}`,
      });

      const saved = await deps.paymentsRepo.attachCharge(payment.id, charge);
      return presentPayment(saved);
    } catch (err) {
      await deps.paymentsRepo.deleteById(payment.id);
      throw err;
    }
  };
}
