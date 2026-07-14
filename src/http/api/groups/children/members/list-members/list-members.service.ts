import { assertGroupOwner } from "../../../groups.authz";
import type { GroupsRepository } from "../../../groups.repository";
import type { MembersRepository } from "../members.repository";
import type { GroupMember } from "../members.types";

export type ListMembersDeps = { groupsRepo: GroupsRepository; membersRepo: MembersRepository };

/** Owner-only listing of a group's members (positions + ratings), ordered by player name. */
export function createListMembersService(deps: ListMembersDeps) {
  return async (groupId: string, userId: string): Promise<GroupMember[]> => {
    const group = await deps.groupsRepo.findById(groupId);
    assertGroupOwner(group, userId);
    return deps.membersRepo.listByGroup(groupId);
  };
}
