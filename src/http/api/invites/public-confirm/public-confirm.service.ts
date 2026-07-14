import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { AttendanceStatus } from "@/http/api/matches/children/attendance/attendance.types";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { InviteRepository } from "../invites.repository";

export type PublicConfirmDeps = {
  inviteRepo: InviteRepository;
  playersRepo: PlayersRepository;
  attendanceRepo: AttendanceRepository;
};

export type PublicConfirmInput = { token: string; name: string; phone?: string | null | undefined };

export type PublicConfirmResult = {
  attendanceId: string;
  status: AttendanceStatus;
  waitlistPos: number | null;
};

/**
 * A guest with NO account confirms presence via a shared invite token —
 * resolves the token, creates a brand-new guest `Player` (`userId: null`,
 * same `createGuest` an organizer's manual add-member flow would use) from
 * the submitted name/phone, then runs the SAME race-safe
 * `AttendanceRepository.confirm` Task 7's authenticated `confirm-presence`
 * uses (locked slot/waitlist transaction — see `attendance.repository.ts`).
 * Throws `ERRORS.INV.INVALID_TOKEN()` (404) for an unknown token.
 */
export function createPublicConfirmService(deps: PublicConfirmDeps) {
  return async (input: PublicConfirmInput): Promise<PublicConfirmResult> => {
    const resolved = await deps.inviteRepo.resolveActive(input.token);
    if (!resolved) throw ERRORS.INV.INVALID_TOKEN();

    const guest = await deps.playersRepo.createGuest({
      name: input.name,
      phone: input.phone ?? null,
    });
    const { attendance } = await deps.attendanceRepo.confirm(resolved.match.id, guest);

    return {
      attendanceId: attendance.id,
      status: attendance.status,
      waitlistPos: attendance.waitlistPos,
    };
  };
}
