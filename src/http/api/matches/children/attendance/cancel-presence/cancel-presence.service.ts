import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type CancelPresenceDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
};

export type CancelPresenceResult = { cancelled: Attendance; promoted: Attendance | null };

/**
 * Cancels one attendee's presence at a match and lets
 * `AttendanceRepository.cancelAndPromote` handle the auto-promotion (lowest
 * `waitlistPos` waitlisted attendee, if any) atomically — see that method's
 * doc comment for the full state-machine. Task 12 hooks a push notification
 * onto `promoted` here.
 *
 * Authorization (closed IDOR, flagged by code review + automated security
 * review): cancelling is a management action, so it's scoped to (a) the
 * attendance's own player — self-cancel, mirrors `confirm-presence`'s
 * self-scoping — or (b) the match's group owner, who manages anyone's
 * presence (same "owner manages the resource" rule `assertMatchOwner`
 * encodes for the CRUD matches endpoints). Anyone else gets `ATT-T0003`
 * (`ERRORS.ATT.CANNOT_MANAGE`), a 403. The target attendance is loaded
 * *before* the actual cancel (`attendanceRepo.findById`) purely to authorize
 * it — the state transition itself still happens inside
 * `cancelAndPromote`'s own locked transaction, unchanged.
 */
export function createCancelPresenceService(deps: CancelPresenceDeps) {
  return async (
    matchId: string,
    attendanceId: string,
    userId: string,
  ): Promise<CancelPresenceResult> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const attendance = await deps.attendanceRepo.findById(matchId, attendanceId);
    if (!attendance) throw ERRORS.ATT.NOT_FOUND();

    const isSelf = attendance.player.userId === userId;
    if (!isSelf) {
      const group = await deps.groupsRepo.findById(match.groupId);
      const isOwner = group?.ownerId === userId;
      if (!isOwner) throw ERRORS.ATT.CANNOT_MANAGE();
    }

    return deps.attendanceRepo.cancelAndPromote(matchId, attendanceId);
  };
}
