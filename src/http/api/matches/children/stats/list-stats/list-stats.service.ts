import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchStatsRepository } from "../stats.repository";
import type { MatchStat } from "../stats.types";

export type ListStatsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  statsRepo: MatchStatsRepository;
};

/**
 * Lists every logged stat row for a match. Authorization mirrors
 * `list-attendance`/`get-result`'s owner-or-member fix: the group owner or
 * any member of the match's group may view it — `ERRORS.STAT.CANNOT_VIEW()`
 * (403) for anyone else. `ERRORS.MTC.NOT_FOUND()` (404) for an unknown
 * match id. Unlike `get-result` there's no "not recorded yet" 404 — an
 * empty array is a perfectly valid answer (stats simply haven't been logged
 * yet).
 */
export function createListStatsService(deps: ListStatsDeps) {
  return async (matchId: string, userId: string): Promise<MatchStat[]> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.STAT.CANNOT_VIEW();
    }

    return deps.statsRepo.listByMatch(matchId);
  };
}
