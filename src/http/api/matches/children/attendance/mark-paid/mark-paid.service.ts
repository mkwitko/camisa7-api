import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type MarkPaidDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
};

/**
 * Self-declared PIX payment: the attendee marks their OWN attendance as
 * `paid` — `paidConfirmedById` stays `null` since nobody *confirmed* it, the
 * player just says they sent the PIX. The group owner may also call this on
 * anyone's behalf (e.g. recording a cash payment handed over in person),
 * still leaving `paidConfirmedById: null` — reaching for owner-confirmed
 * provenance is what `confirm-payment` is for.
 *
 * Authorization mirrors `cancel-presence`'s fixed IDOR model exactly: self
 * (attendance's own player) OR the match's group owner. Anyone else gets
 * `ATT-T0003` (`ERRORS.ATT.CANNOT_MANAGE`), a 403. The target attendance is
 * loaded first purely to authorize/read its player, before the actual
 * `setPayment` write.
 */
export function createMarkPaidService(deps: MarkPaidDeps) {
  return async (matchId: string, attendanceId: string, userId: string): Promise<Attendance> => {
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

    return deps.attendanceRepo.setPayment(attendanceId, "paid", null);
  };
}
