import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment } from "../teams.types";

export type GetTeamsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  teamsRepo: TeamsRepository;
};

/**
 * Returns the persisted team split for a match, without re-running the
 * balancer. Authorization mirrors `list-attendance`'s owner-or-member fix
 * (Task 7's IDOR closure): the group owner or any member of the match's
 * group may view it — `ERRORS.TEAM.CANNOT_VIEW()` (403) for anyone else.
 * `ERRORS.MTC.NOT_FOUND()` (404) for an unknown match id;
 * `ERRORS.TEAM.NOT_GENERATED()` (404) if `generate-teams`/`update-teams`
 * were never called for this match.
 */
export function createGetTeamsService(deps: GetTeamsDeps) {
  return async (matchId: string, userId: string): Promise<TeamAssignment> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.TEAM.CANNOT_VIEW();
    }

    const assignment = await deps.teamsRepo.findByMatch(matchId);
    if (!assignment) throw ERRORS.TEAM.NOT_GENERATED();
    return assignment;
  };
}
