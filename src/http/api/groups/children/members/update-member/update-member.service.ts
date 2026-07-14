import { ERRORS } from "@/shared/errors/catalog";
import { assertGroupOwner } from "../../../groups.authz";
import type { GroupsRepository } from "../../../groups.repository";
import type { MembersRepository, UpdateRatingPatch } from "../members.repository";
import type { GroupMember } from "../members.types";

export type UpdateMemberDeps = { groupsRepo: GroupsRepository; membersRepo: MembersRepository };

export type UpdateMemberInput = {
  groupId: string;
  memberId: string;
  userId: string;
  patch: UpdateRatingPatch;
};

/**
 * Owner updates a member's rating (positions + affinity + seed overall).
 * `findInGroup` re-scopes `memberId` to `groupId` so a member from a
 * different group can't be targeted — `ERRORS.PLR.MEMBER_NOT_FOUND()` (404)
 * if it doesn't belong here.
 */
export function createUpdateMemberService(deps: UpdateMemberDeps) {
  return async (input: UpdateMemberInput): Promise<GroupMember> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    const existing = await deps.membersRepo.findInGroup(input.groupId, input.memberId);
    if (!existing) throw ERRORS.PLR.MEMBER_NOT_FOUND();

    return deps.membersRepo.updateRating(input.memberId, input.patch);
  };
}
