import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { VotesRepository } from "../votes.repository";
import type { CategoryTally } from "../votes.types";

export type ListVoteTallyDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  votesRepo: VotesRepository;
};

/**
 * Returns the aggregated vote tally for a match — per category, per
 * candidate counts plus the category leader. Never exposes who voted for
 * whom (privacy — see `VotesRepository.tallyByMatch`'s doc comment).
 * Authorization mirrors `list-stats`/`get-result`'s owner-or-member fix: the
 * group owner or any member of the match's group may view it —
 * `ERRORS.VOTE.CANNOT_VIEW()` (403) for anyone else. `ERRORS.MTC.NOT_FOUND()`
 * (404) for an unknown match id. Unlike `get-result` there's no "not
 * recorded yet" 404 — an all-zero tally (every category present, empty
 * `tally`, `leaderPlayerId: null`) is a perfectly valid answer when no votes
 * have been cast yet.
 */
export function createListVoteTallyService(deps: ListVoteTallyDeps) {
  return async (matchId: string, userId: string): Promise<CategoryTally[]> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.VOTE.CANNOT_VIEW();
    }

    return deps.votesRepo.tallyByMatch(matchId);
  };
}
