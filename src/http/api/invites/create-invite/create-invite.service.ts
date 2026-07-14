import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { InviteRepository } from "../invites.repository";

export type CreateInviteDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  inviteRepo: InviteRepository;
};

/**
 * Group owner mints (or reuses) a shareable invite token for their own
 * match — same ownership check `cancel-match`/`create-match` use
 * (`assertMatchOwner`, resolving the match's parent group).
 */
export function createCreateInviteService(deps: CreateInviteDeps) {
  return async (matchId: string, userId: string): Promise<{ token: string }> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, userId);

    return deps.inviteRepo.create(matchId);
  };
}
