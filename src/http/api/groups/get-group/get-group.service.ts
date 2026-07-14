import { assertGroupOwner } from "../groups.authz";
import type { GroupsRepository } from "../groups.repository";
import type { Group } from "../groups.types";

export type GetGroupDeps = { repo: GroupsRepository };

/**
 * Direct by-id fetch of a single group. Unlike a nested child-resource
 * ownership check (e.g. `get-match` re-using `assertGroupOwner` on the
 * match's parent group in Task 6, where 403 is fine because the caller
 * already knows the parent exists), this is the top-level `GET /groups/:id`
 * — leaking "this id exists, but isn't yours" via 403 would let any
 * authenticated user enumerate other groups' ids. So a group that exists but
 * belongs to someone else is folded into the same 404 as a group that
 * doesn't exist at all, by filtering it to `null` before `assertGroupOwner`.
 */
export function createGetGroupService(deps: GetGroupDeps) {
  return async (id: string, userId: string): Promise<Group> => {
    const group = await deps.repo.findById(id);
    const visible = group && group.ownerId === userId ? group : null;
    return assertGroupOwner(visible, userId);
  };
}
