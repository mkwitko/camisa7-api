import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertDueOwner } from "../dues.authz";
import type { DuesRepository } from "../dues.repository";
import type { MembershipDue } from "../dues.types";

export type ConfirmDueDeps = {
  duesRepo: DuesRepository;
  groupsRepo: GroupsRepository;
};

/**
 * Owner-confirmed payment: unlike `mark-paid-due`'s self-declaration, this
 * records that the group owner *verified* the payment actually arrived —
 * `paidConfirmedById` is set to the owner's own `userId`. `paid: false` (the
 * default is `true`, see `confirm-due.schema.ts`) is the owner's
 * dispute/undo path: flips the due back to `pending` and clears
 * `paidConfirmedById`. Mirrors `confirm-payment.service.ts` (attendance)
 * exactly.
 *
 * Authorization: strictly group-owner-only, via `assertDueOwner` (this
 * resource's own `assertMatchOwner`/`assertSeriesOwner` equivalent) — no
 * self path here, since self-declaring is exactly what `mark-paid-due` is
 * for. Throws `DUE-T0001`/`GRP-T0001`/`GRP-T0002` (via `assertDueOwner`).
 */
export function createConfirmDueService(deps: ConfirmDueDeps) {
  return async (dueId: string, userId: string, paid: boolean): Promise<MembershipDue> => {
    const found = await deps.duesRepo.findByIdWithMember(dueId);
    const group = found ? await deps.groupsRepo.findById(found.groupId) : null;
    assertDueOwner(found?.due ?? null, group, userId);

    return deps.duesRepo.setStatus(dueId, paid ? "paid" : "pending", paid ? userId : null);
  };
}
