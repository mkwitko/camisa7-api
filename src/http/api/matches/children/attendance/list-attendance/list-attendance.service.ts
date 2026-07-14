import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type ListAttendanceDeps = { attendanceRepo: AttendanceRepository };

/** Lists every attendance (any status) for a match, oldest first. */
export function createListAttendanceService(deps: ListAttendanceDeps) {
  return async (matchId: string): Promise<Attendance[]> => {
    return deps.attendanceRepo.listByMatch(matchId);
  };
}
