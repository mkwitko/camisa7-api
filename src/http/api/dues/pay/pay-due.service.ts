import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { PaymentsRepository } from "@/http/api/payments/payments.repository";
import type { Payment } from "@/http/api/payments/payments.types";
import { createCharge, isWooviConfigured } from "@/infra/woovi/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { DuesRepository } from "../dues.repository";
import type { PayDueResponse } from "./pay-due.schema";

export type PayDueDeps = {
  duesRepo: DuesRepository;
  groupsRepo: GroupsRepository;
  paymentsRepo: PaymentsRepository;
};

function presentPayment(payment: Payment): PayDueResponse {
  return {
    paymentId: payment.id,
    status: payment.status,
    brCode: payment.brCode,
    qrCodeImage: payment.qrCodeImage,
    paymentLinkUrl: payment.paymentLinkUrl,
  };
}

/**
 * `POST /dues/:id/pay` — mints (or reuses) the Woovi PIX charge for a
 * mensalista's own monthly due. Mirrors `pay-attendance.service.ts` (Task 5)
 * exactly, down to the create-then-charge-with-cleanup pattern — see that
 * file's doc comment for the full rationale.
 *
 * Self-only: the due's own member (`playerUserId === userId`, resolved via
 * `duesRepo.findByIdWithMember`) is the only one who can pay it — no
 * group-owner override here (an owner recording a payment on someone's
 * behalf is `mark-paid-due`'s job, not this endpoint). A mismatch is
 * `DUE-T0002` (`ERRORS.DUE.CANNOT_MANAGE`, 403), the same code
 * `mark-paid-due` uses for "you have no standing over this due".
 *
 * Guard order: config gate first (`WOO.DISABLED`, 503, before touching the
 * DB), then the due lookup/ownership, then the due-level payable check (must
 * be `pending` — an already-`paid` due has nothing left to charge,
 * `WOO.NOT_PAYABLE`), and finally the group's Woovi subaccount
 * (`wooviPixKey` unset → `WOO.NO_SUBACCOUNT`).
 *
 * Idempotent: a `pending` `Payment` already open for this due
 * (`findPendingByDue`) is returned as-is — no second `createCharge` call. A
 * fresh `Payment` (kind `membership_due`, `valueCents = due.amountCents`,
 * `membershipDueId = due.id`) is inserted first, then `createCharge` is
 * called with its `correlationID`, and the response is persisted via
 * `attachCharge`. If `createCharge`/`attachCharge` throws, the just-inserted
 * `Payment` is deleted (`deleteById`) before rethrowing.
 */
export function createPayDueService(deps: PayDueDeps) {
  return async (dueId: string, userId: string): Promise<PayDueResponse> => {
    if (!isWooviConfigured) throw ERRORS.WOO.DISABLED();

    const found = await deps.duesRepo.findByIdWithMember(dueId);
    if (!found) throw ERRORS.DUE.NOT_FOUND();
    if (found.playerUserId !== userId) throw ERRORS.DUE.CANNOT_MANAGE();
    if (found.due.status !== "pending") throw ERRORS.WOO.NOT_PAYABLE();

    const group = await deps.groupsRepo.findById(found.groupId);
    if (!group?.wooviPixKey) throw ERRORS.WOO.NO_SUBACCOUNT();

    const existing = await deps.paymentsRepo.findPendingByDue(found.due.id);
    if (existing) return presentPayment(existing);

    const payment = await deps.paymentsRepo.create({
      kind: "membership_due",
      valueCents: found.due.amountCents,
      subaccountPixKey: group.wooviPixKey,
      membershipDueId: found.due.id,
    });

    try {
      const charge = await createCharge({
        correlationID: payment.correlationID,
        value: found.due.amountCents,
        subaccount: group.wooviPixKey,
        comment: `Mensalidade ${group.name}`,
      });

      const saved = await deps.paymentsRepo.attachCharge(payment.id, charge);
      return presentPayment(saved);
    } catch (err) {
      await deps.paymentsRepo.deleteById(payment.id);
      throw err;
    }
  };
}
