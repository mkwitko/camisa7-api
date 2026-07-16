import { assertGroupOwner } from "../groups.authz";
import type { GroupsRepository, UpdateGroupPatch } from "../groups.repository";
import type { Group } from "../groups.types";

export type UpdateGroupDeps = { groupsRepo: GroupsRepository };

export type UpdateGroupInput = {
  groupId: string;
  userId: string;
  patch: UpdateGroupPatch;
};

/**
 * Owner-only update of group settings (currently just `monthlyFeeCents` —
 * Task 1's Mensalista vs Avulso default fee). Mirrors `update-member`'s
 * shape: fetch, `assertGroupOwner` (404 unknown / 403 not owner), then apply
 * the patch via the repo's conditional-spread `update`.
 */
export function createUpdateGroupService(deps: UpdateGroupDeps) {
  return async (input: UpdateGroupInput): Promise<Group> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    return deps.groupsRepo.update(input.groupId, input.patch);
  };
}
