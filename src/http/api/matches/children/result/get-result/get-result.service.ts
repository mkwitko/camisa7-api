import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchResultRepository } from "../result.repository";
import type { MatchResult } from "../result.types";

export type GetResultDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  resultRepo: MatchResultRepository;
};

/**
 * Returns the recorded result for a match. Authorization mirrors
 * `list-attendance`/`get-teams`' owner-or-member fix: the group owner or any
 * member of the match's group may view it — `ERRORS.RES.CANNOT_VIEW()` (403)
 * for anyone else. `ERRORS.MTC.NOT_FOUND()` (404) for an unknown match id;
 * `ERRORS.RES.NOT_FOUND()` (404) if `record-result` was never called for
 * this match.
 */
export function createGetResultService(deps: GetResultDeps) {
  return async (matchId: string, userId: string): Promise<MatchResult> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.RES.CANNOT_VIEW();
    }

    const result = await deps.resultRepo.findByMatch(matchId);
    if (!result) throw ERRORS.RES.NOT_FOUND();
    return result;
  };
}
