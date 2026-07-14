import { assertGroupOwner } from "../../../groups.authz";
import type { GroupsRepository } from "../../../groups.repository";
import type { AddGuestInput, MembersRepository } from "../members.repository";
import type { GroupMember } from "../members.types";

export type AddMemberDeps = { groupsRepo: GroupsRepository; membersRepo: MembersRepository };

export type AddMemberInput = AddGuestInput & { groupId: string; userId: string };

/**
 * Owner adds a guest `Player` (`userId: null`) as a `jogador` member of the
 * group, with its initial rating (positions + affinity + seed overall).
 * 403s via `assertGroupOwner` if the caller isn't the group's owner — see
 * `get-group.service.ts` for why a child resource is fine leaking existence
 * via 403 (unlike the top-level `GET /groups/:id`).
 */
export function createAddMemberService(deps: AddMemberDeps) {
  return async (input: AddMemberInput): Promise<GroupMember> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);
    return deps.membersRepo.addGuest(input.groupId, input);
  };
}
