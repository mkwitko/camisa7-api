import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type ListAttendanceDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
};

/**
 * Lists every attendance (any status) for a match, oldest first.
 *
 * Authorization (closed IDOR/PII leak, flagged by code review + automated
 * security review): the roster carries each attendee's name/phone/payment
 * status, so it's scoped to people with actual standing in the match's
 * group — the owner (manages everyone) or any member (may view the
 * attendee list, per the app's authorization model). Anyone else gets
 * `ATT-T0003` (`ERRORS.ATT.CANNOT_MANAGE` — same 403 code `cancel-presence`
 * uses for its own authz gap; one consistent code for "no standing over
 * this match's attendance", covering both the manage and view cases).
 */
export function createListAttendanceService(deps: ListAttendanceDeps) {
  return async (matchId: string, userId: string): Promise<Attendance[]> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.ATT.CANNOT_MANAGE();
    }

    return deps.attendanceRepo.listByMatch(matchId);
  };
}
