import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { DuesRepository } from "../dues.repository";
import type { MembershipDue } from "../dues.types";

export type ListGroupDuesDeps = {
  duesRepo: DuesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
};

/**
 * Lists every `mensalista` due of `groupId` for `month` ("YYYY-MM").
 *
 * Authorization mirrors `list-attendance`'s exactly (same "owner-or-member"
 * shape, see that service's doc comment): the owner (manages billing for
 * everyone) or any member (may view their own group's dues roster). Anyone
 * else gets `DUE-T0002` (`ERRORS.DUE.CANNOT_MANAGE()`), a 403 — one
 * consistent code for "no standing over this group's dues", same rationale
 * `ATT.CANNOT_MANAGE` uses for attendance.
 */
export function createListGroupDuesService(deps: ListGroupDuesDeps) {
  return async (groupId: string, userId: string, month: string): Promise<MembershipDue[]> => {
    const group = await deps.groupsRepo.findById(groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(groupId, userId);
      if (!isMember) throw ERRORS.DUE.CANNOT_MANAGE();
    }

    return deps.duesRepo.listByGroupMonth(groupId, month);
  };
}
