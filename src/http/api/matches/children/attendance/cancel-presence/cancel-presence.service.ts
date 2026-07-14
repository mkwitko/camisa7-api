import type { PushGateway } from "@/gateways/push/push.gateway";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { logger } from "@/infra/observability/logger";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type CancelPresenceDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  authRepo: AuthRepository;
  push: PushGateway;
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
 *
 * Task 12: when `cancelAndPromote` promotes someone off the waitlist, fire a
 * push notification IF that player is linked to a registered `User`
 * (`player.userId` set) who has an `expoPushToken` registered. Guests
 * (`userId` null) get no push — honest limitation, promotion still happens
 * and shows on their next fetch. This is deliberately best-effort: a
 * DB/network hiccup while looking up or sending the push must never fail the
 * cancel response the caller is waiting on, so it's wrapped and logged, not
 * awaited-to-fail.
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

    const result = await deps.attendanceRepo.cancelAndPromote(matchId, attendanceId);

    if (result.promoted?.player.userId) {
      await notifyPromoted(deps, result.promoted.player.userId);
    }

    return result;
  };
}

/** Best-effort: looks up the promoted player's push token and fires the notification; never throws. */
async function notifyPromoted(deps: CancelPresenceDeps, promotedUserId: string): Promise<void> {
  try {
    const token = await deps.authRepo.getPushToken(promotedUserId);
    if (!token) return;
    await deps.push.send({ to: token, title: "Pelada", body: "Você subiu da fila!" });
  } catch (error) {
    logger.warn(
      { userId: promotedUserId, err: error },
      "cancel-presence: failed to notify promoted player",
    );
  }
}
