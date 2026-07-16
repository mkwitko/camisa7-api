import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { DuesRepository } from "../dues.repository";
import type { MembershipDue } from "../dues.types";

export type MarkPaidDueDeps = {
  duesRepo: DuesRepository;
  groupsRepo: GroupsRepository;
};

/**
 * Self-declared payment: the due's own member (`player.userId === userId`)
 * marks their OWN due as `paid` — `paidConfirmedById` stays `null` since
 * nobody *confirmed* it, the member just says they paid. The group owner may
 * also call this on anyone's behalf (e.g. recording a cash payment handed
 * over in person), still leaving `paidConfirmedById: null` — reaching for
 * owner-confirmed provenance is what `confirm-due` is for. Mirrors
 * `mark-paid.service.ts` (attendance) exactly.
 *
 * Authorization: self (the due's own member) OR the due's group owner.
 * Anyone else gets `DUE-T0002` (`ERRORS.DUE.CANNOT_MANAGE()`), a 403. The
 * target due is loaded first (via `findByIdWithMember`, which also resolves
 * the bits needed to authorize) purely to authorize/read its member, before
 * the actual `setStatus` write. Throws `DUE-T0001` if `dueId` doesn't exist.
 */
export function createMarkPaidDueService(deps: MarkPaidDueDeps) {
  return async (dueId: string, userId: string): Promise<MembershipDue> => {
    const found = await deps.duesRepo.findByIdWithMember(dueId);
    if (!found) throw ERRORS.DUE.NOT_FOUND();

    const isSelf = found.playerUserId === userId;
    if (!isSelf) {
      const group = await deps.groupsRepo.findById(found.groupId);
      const isOwner = group?.ownerId === userId;
      if (!isOwner) throw ERRORS.DUE.CANNOT_MANAGE();
    }

    return deps.duesRepo.setStatus(dueId, "paid", null);
  };
}
