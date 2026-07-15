import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import type {
  MergeGuestPlayerRepository,
  MergeSummary,
} from "@/http/api/players/merge-guest-player.repository";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { ERRORS } from "@/shared/errors/catalog";
import { assertGroupOwner } from "../../../groups.authz";
import type { GroupsRepository } from "../../../groups.repository";
import type { MembersRepository } from "../members.repository";
import type { GroupMember } from "../members.types";

export type LinkMemberUserDeps = {
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  authRepo: AuthRepository;
  playersRepo: PlayersRepository;
  mergeRepo: MergeGuestPlayerRepository;
  careerRepo: PlayerCareerRepository;
};

export type LinkMemberUserInput = {
  groupId: string;
  memberId: string;
  userId: string;
  email: string;
};

export type LinkMemberUserResult = { member: GroupMember; summary: MergeSummary };

/**
 * Organizer-vouched guest→account linking (replaces the removed phone-only
 * `POST /players/claim` — see `merge-guest-player.repository.ts`'s doc
 * comment for the security context). The trust anchor here is the GROUP
 * OWNER, not a phone match: only the owner of `groupId` (`assertGroupOwner`)
 * can call this, and they're vouching "I know this guest IRL and they really
 * are the person behind `email`."
 *
 * Steps: 1) confirm `memberId` belongs to this group and is still a GUEST
 * (`player.userId === null` — `ERRORS.PLR.MEMBER_NOT_GUEST()` 400 if it's
 * already a registered/linked member); 2) resolve `email` to a REGISTERED
 * `User` (`ERRORS.PLR.USER_NOT_FOUND()` 404 if none); 3) resolve/create that
 * user's canonical `Player` the same way every other flow does
 * (`findOrCreateForUser`); 4) reuse the exact merge machinery the old
 * phone-claim used (`mergeGuestIntoPlayer`) to fold the guest's ENTIRE
 * history into the target's canonical player, then recompute the target's
 * career if anything was actually merged; 5) return the (now-linked)
 * `GroupMember` row for the target player in this group — guaranteed to
 * exist after the merge, since `mergeGuestIntoPlayer` always leaves exactly
 * one surviving `GroupMember` row per (groupId, playerId) it touches.
 */
export function createLinkMemberUserService(deps: LinkMemberUserDeps) {
  return async (input: LinkMemberUserInput): Promise<LinkMemberUserResult> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    const member = await deps.membersRepo.findInGroup(input.groupId, input.memberId);
    if (!member) throw ERRORS.PLR.MEMBER_NOT_FOUND();
    if (member.player.userId !== null) throw ERRORS.PLR.MEMBER_NOT_GUEST();

    const targetUser = await deps.authRepo.findByEmail(input.email);
    if (!targetUser) throw ERRORS.PLR.USER_NOT_FOUND();

    const targetPlayer = await deps.playersRepo.findOrCreateForUser(targetUser.id);

    const summary = await deps.mergeRepo.mergeGuestIntoPlayer(member.player.id, targetPlayer.id);
    if (summary.guestsMerged > 0) {
      await deps.careerRepo.recomputeForPlayer(targetPlayer.id);
    }

    const linkedMember = await deps.membersRepo.findByGroupAndPlayer(
      input.groupId,
      targetPlayer.id,
    );
    if (!linkedMember) throw ERRORS.PLR.MEMBER_NOT_FOUND();

    return { member: linkedMember, summary };
  };
}
