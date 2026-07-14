import { ERRORS } from "@/shared/errors/catalog";
import type { Group } from "./groups.types";

/**
 * Ownership-authorization primitive: every child resource under a group
 * (Tasks 5,6,8,9,10,11) re-checks `group.ownerId === userId` this exact way.
 * Throws `ERRORS.GRP.NOT_FOUND()` (404) if `group` is null (either the id
 * doesn't exist, or — deliberately, to avoid leaking existence — it belongs
 * to someone else and the caller looked it up by id without an ownership
 * filter), `ERRORS.GRP.NOT_OWNER()` (403) if it exists but `ownerId` doesn't
 * match. Narrows the return type to non-null `Group` for the caller.
 */
export function assertGroupOwner(group: Group | null, userId: string): Group {
  if (!group) throw ERRORS.GRP.NOT_FOUND();
  if (group.ownerId !== userId) throw ERRORS.GRP.NOT_OWNER();
  return group;
}
