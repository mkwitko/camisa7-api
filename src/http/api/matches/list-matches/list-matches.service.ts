import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";

export type ListMatchesDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

/** Owner lists matches belonging to their own group, optionally including finished ones. */
export function createListMatchesService(deps: ListMatchesDeps) {
  return async (
    groupId: string,
    userId: string,
    opts: { includeFinished: boolean },
  ): Promise<Match[]> => {
    const group = await deps.groupsRepo.findById(groupId);
    assertGroupOwner(group, userId);

    return deps.matchesRepo.listByGroup(groupId, opts);
  };
}
