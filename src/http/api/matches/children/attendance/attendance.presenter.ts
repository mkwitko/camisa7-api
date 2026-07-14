import type { AttendanceResponse, CancelPresenceResponse } from "./attendance.schema";
import type { Attendance } from "./attendance.types";

/** Flattens a domain `Attendance` (attendance row joined with its `Player`) into the API response shape. */
export function presentAttendance(attendance: Attendance): AttendanceResponse {
  return {
    id: attendance.id,
    matchId: attendance.matchId,
    status: attendance.status,
    waitlistPos: attendance.waitlistPos,
    paymentStatus: attendance.paymentStatus,
    paidConfirmedById: attendance.paidConfirmedById,
    player: {
      id: attendance.player.id,
      userId: attendance.player.userId,
      name: attendance.player.name,
      phone: attendance.player.phone,
    },
  };
}

/** Maps `AttendanceRepository.cancelAndPromote`'s result to the `cancel-presence` response shape. */
export function presentCancelResult(result: {
  cancelled: Attendance;
  promoted: Attendance | null;
}): CancelPresenceResponse {
  return {
    cancelled: presentAttendance(result.cancelled),
    promoted: result.promoted ? presentAttendance(result.promoted) : null,
  };
}
