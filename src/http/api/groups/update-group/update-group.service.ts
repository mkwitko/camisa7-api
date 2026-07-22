import type { EntitlementsService } from "@/http/api/billing/entitlements.service";
import { ERRORS } from "@/shared/errors/catalog";
import { assertGroupOwner } from "../groups.authz";
import type { GroupsRepository, UpdateGroupPatch } from "../groups.repository";
import type { Group } from "../groups.types";

export type UpdateGroupDeps = {
  groupsRepo: GroupsRepository;
  entitlements: EntitlementsService;
};

export type UpdateGroupInput = {
  groupId: string;
  userId: string;
  patch: UpdateGroupPatch;
};

/**
 * Owner-only update of group settings (`monthlyFeeCents`, and — Geo G3 —
 * `isPublic`/`joinPolicy`). Fetch, `assertGroupOwner` (404 unknown / 403 not
 * owner), then apply the patch via the repo's conditional-spread `update`.
 *
 * Geo G3 gate: turning a group PUBLIC (`isPublic === true`) is the real
 * consumption point of the `public_groups` entitlement — the owner must hold
 * that feature or the update is rejected with `GRP.PUBLIC_REQUIRES_PLAN`
 * (403). Setting `isPublic` back to `false` (or leaving it untouched) is never
 * gated. Entitlements come from the DB (an `active` Woovi subscription — see
 * `entitlements.service.ts`); without one, this path is a hard 403 unless the
 * account is a reviewer (bypass grants all).
 */
export function createUpdateGroupService(deps: UpdateGroupDeps) {
  return async (input: UpdateGroupInput): Promise<Group> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    if (input.patch.isPublic === true) {
      if (!(await deps.entitlements.hasFeature(input.userId, "public_groups"))) {
        throw ERRORS.GRP.PUBLIC_REQUIRES_PLAN();
      }
    }

    return deps.groupsRepo.update(input.groupId, input.patch);
  };
}
