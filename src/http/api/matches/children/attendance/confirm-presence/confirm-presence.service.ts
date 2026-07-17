import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type ConfirmPresenceDeps = {
  attendanceRepo: AttendanceRepository;
  playersRepo: PlayersRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
};

export type ConfirmPresenceInput = { matchId: string; userId: string };

/**
 * An authenticated user confirms their OWN presence at a match — reuses their
 * existing `Player` (linked via `userId`) or creates one on first use
 * (`findOrCreateForUser`, same helper `add-member`'s `addForUser` uses).
 *
 * Geo G3 authorization (resolve match → group, then gate by the group's
 * visibility/policy):
 * - PRIVATE group (`isPublic === false`): the caller must be a `GroupMember`
 *   of that group (`membersRepo.findByGroupAndPlayer`) — otherwise
 *   `ATT.NOT_A_MEMBER` (403). This formalizes the previously-open behavior.
 * - PUBLIC group + `open`: any authenticated user may confirm (fila when the
 *   match is full) — unchanged.
 * - PUBLIC group + `request`: a direct confirm is refused with
 *   `ATT.JOIN_REQUEST_REQUIRED` (409); the caller must open a join request
 *   (Fase 2) for the organizer to approve.
 *
 * The guest path (no account) is Task 9's `public-confirm` (invite token),
 * which is unaffected by this gate.
 */
export function createConfirmPresenceService(deps: ConfirmPresenceDeps) {
  return async (input: ConfirmPresenceInput): Promise<Attendance> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    if (!group) throw ERRORS.MTC.NOT_FOUND();

    const player = await deps.playersRepo.findOrCreateForUser(input.userId);

    if (group.isPublic) {
      if (group.joinPolicy === "request") throw ERRORS.ATT.JOIN_REQUEST_REQUIRED();
      // `open` → any authenticated user may confirm.
    } else {
      const membership = await deps.membersRepo.findByGroupAndPlayer(group.id, player.id);
      if (!membership) throw ERRORS.ATT.NOT_A_MEMBER();
    }

    const { attendance } = await deps.attendanceRepo.confirm(input.matchId, player);
    return attendance;
  };
}
