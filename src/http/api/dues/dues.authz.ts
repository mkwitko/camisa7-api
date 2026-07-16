import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { Group } from "@/http/api/groups/groups.types";
import { ERRORS } from "@/shared/errors/catalog";
import type { MembershipDue } from "./dues.types";

/**
 * Ownership-authorization primitive for the `dues` resource — mirrors
 * `matches.authz.ts`'s `assertMatchOwner`/`series.authz.ts`'s
 * `assertSeriesOwner` exactly: resolves the due's own parent group (via its
 * `GroupMember`, see `DuesRepository.findByIdWithMember`) and reuses
 * `assertGroupOwner` on it. Throws `ERRORS.DUE.NOT_FOUND()` (404) if `due` is
 * null (unknown due id). `group` is the due's parent group, already looked
 * up by the caller via the `groupId` `findByIdWithMember` resolved — if it's
 * null (shouldn't happen given the FK) or doesn't belong to `userId`,
 * `assertGroupOwner` throws `GRP-T0001`/`GRP-T0002`. Used by `confirm-due`
 * (owner-only, no self path — self-declaring is `mark-paid-due`'s job).
 */
export function assertDueOwner(
  due: MembershipDue | null,
  group: Group | null,
  userId: string,
): { due: MembershipDue; group: Group } {
  if (!due) throw ERRORS.DUE.NOT_FOUND();
  const assertedGroup = assertGroupOwner(group, userId);
  return { due, group: assertedGroup };
}
