import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type CancelPresenceDeps = { attendanceRepo: AttendanceRepository };

export type CancelPresenceResult = { cancelled: Attendance; promoted: Attendance | null };

/**
 * Cancels one attendee's presence at a match and lets
 * `AttendanceRepository.cancelAndPromote` handle the auto-promotion (lowest
 * `waitlistPos` waitlisted attendee, if any) atomically — see that method's
 * doc comment for the full state-machine. Task 12 hooks a push notification
 * onto `promoted` here.
 */
export function createCancelPresenceService(deps: CancelPresenceDeps) {
  return async (matchId: string, attendanceId: string): Promise<CancelPresenceResult> => {
    return deps.attendanceRepo.cancelAndPromote(matchId, attendanceId);
  };
}
