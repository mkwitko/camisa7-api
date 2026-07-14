import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { Group } from "@/http/api/groups/groups.types";
import { ERRORS } from "@/shared/errors/catalog";
import type { Match } from "./matches.types";

/**
 * Ownership-authorization primitive for the `matches` resource: resolves the
 * match's own parent group and reuses `assertGroupOwner` on it. Throws
 * `ERRORS.MTC.NOT_FOUND()` (404) if `match` is null (unknown match id).
 * `group` is the match's parent group, already looked up by the caller via
 * `match.groupId` — if it's null (shouldn't happen given the FK, but the
 * caller may pass null defensively when `match` itself was null) or doesn't
 * belong to `userId`, `assertGroupOwner` throws `GRP-T0001`/`GRP-T0002`.
 *
 * Unlike the top-level `GET /groups/:id` (see `get-group.service.ts`), a 403
 * here is fine: the caller already knows the match exists (they have its
 * id), so there's no existence-enumeration risk in distinguishing "not
 * yours" (403) from "doesn't exist" (404).
 */
export function assertMatchOwner(
  match: Match | null,
  group: Group | null,
  userId: string,
): { match: Match; group: Group } {
  if (!match) throw ERRORS.MTC.NOT_FOUND();
  const assertedGroup = assertGroupOwner(group, userId);
  return { match, group: assertedGroup };
}
