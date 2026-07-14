import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "../matches.authz";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";

export type GetMatchDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

/**
 * By-id fetch of a single match, scoped to the caller owning its parent
 * group. See `matches.authz.ts` for why a 403 (not 404) is fine here for a
 * non-owner — unlike the top-level `GET /groups/:id`.
 */
export function createGetMatchService(deps: GetMatchDeps) {
  return async (matchId: string, userId: string): Promise<Match> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, userId);
    return asserted;
  };
}
