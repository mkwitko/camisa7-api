import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import { assertMatchOwner } from "../matches.authz";
import type { MatchesRepository, UpdateMatchPatch } from "../matches.repository";
import type { Match } from "../matches.types";

export type UpdateMatchDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

export type UpdateMatchInput = {
  matchId: string;
  userId: string;
  patch: UpdateMatchPatch;
};

/**
 * Owner updates a match's fields. A `finished`/`cancelled` match is a
 * historical record — editing it after the fact (price, slots, datetime)
 * would silently rewrite what actually happened, so it's rejected with
 * `ERRORS.MTC.NOT_EDITABLE()` (409) before touching the repository.
 */
export function createUpdateMatchService(deps: UpdateMatchDeps) {
  return async (input: UpdateMatchInput): Promise<Match> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, input.userId);

    if (asserted.status === "finished" || asserted.status === "cancelled") {
      throw ERRORS.MTC.NOT_EDITABLE();
    }

    return deps.matchesRepo.update(input.matchId, input.patch);
  };
}
