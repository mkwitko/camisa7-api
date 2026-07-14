import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "../matches.authz";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";

export type CancelMatchDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

/**
 * Owner cancels a match — sets `status: "cancelled"` regardless of the
 * current status (idempotent: cancelling twice is a no-op, not an error,
 * unlike `update-match`'s stricter `NOT_EDITABLE` guard on field edits).
 */
export function createCancelMatchService(deps: CancelMatchDeps) {
  return async (matchId: string, userId: string): Promise<Match> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, userId);

    return deps.matchesRepo.setStatus(matchId, "cancelled");
  };
}
