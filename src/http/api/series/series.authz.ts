import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { Group } from "@/http/api/groups/groups.types";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchSeries } from "./series.types";

/**
 * Ownership-authorization primitive for the `series` resource — mirrors
 * `matches.authz.ts`'s `assertMatchOwner` exactly: resolves the series' own
 * parent group and reuses `assertGroupOwner` on it. Throws
 * `ERRORS.SER.NOT_FOUND()` (404) if `series` is null (unknown series id).
 * `group` is the series' parent group, already looked up by the caller via
 * `series.groupId` — if it's null (shouldn't happen given the FK, but the
 * caller may pass null defensively when `series` itself was null) or doesn't
 * belong to `userId`, `assertGroupOwner` throws `GRP-T0001`/`GRP-T0002`.
 */
export function assertSeriesOwner(
  series: MatchSeries | null,
  group: Group | null,
  userId: string,
): { series: MatchSeries; group: Group } {
  if (!series) throw ERRORS.SER.NOT_FOUND();
  const assertedGroup = assertGroupOwner(group, userId);
  return { series, group: assertedGroup };
}
