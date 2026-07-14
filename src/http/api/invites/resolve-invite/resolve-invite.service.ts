import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { MatchStatus } from "@/http/api/matches/matches.types";
import { ERRORS } from "@/shared/errors/catalog";
import type { InviteRepository } from "../invites.repository";

export type ResolveInviteDeps = {
  inviteRepo: InviteRepository;
  attendanceRepo: AttendanceRepository;
};

export type ResolveInviteResult = {
  matchId: string;
  groupName: string;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: MatchStatus;
  confirmedCount: number;
  waitlistCount: number;
};

/**
 * Public lookup (no auth) — a guest opening the WhatsApp-shared link. Throws
 * `ERRORS.INV.INVALID_TOKEN()` (404) for an unknown token. Counts are
 * derived from `AttendanceRepository.listByMatch` (same rows `list-attendance`
 * uses) rather than a fresh query — no `GroupMember` involved, so there's no
 * rating data in scope to accidentally return (see the response schema's
 * doc comment for the full leak argument).
 */
export function createResolveInviteService(deps: ResolveInviteDeps) {
  return async (token: string): Promise<ResolveInviteResult> => {
    const resolved = await deps.inviteRepo.resolveActive(token);
    if (!resolved) throw ERRORS.INV.INVALID_TOKEN();

    const attendances = await deps.attendanceRepo.listByMatch(resolved.match.id);
    const confirmedCount = attendances.filter((a) => a.status === "confirmed").length;
    const waitlistCount = attendances.filter((a) => a.status === "waitlisted").length;

    return {
      matchId: resolved.match.id,
      groupName: resolved.groupName,
      datetime: resolved.match.datetime,
      location: resolved.match.location,
      priceCents: resolved.match.priceCents,
      slots: resolved.match.slots,
      pixKey: resolved.match.pixKey,
      status: resolved.match.status,
      confirmedCount,
      waitlistCount,
    };
  };
}
