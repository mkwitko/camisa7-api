import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import { assertMatchOwner } from "../../../matches.authz";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type ConfirmPaymentDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
};

/**
 * Owner-confirmed PIX payment: unlike `mark-paid`'s self-declaration, this
 * records that the group owner *verified* the payment actually arrived —
 * `paidConfirmedById` is set to the owner's own `userId`. `paid: false`
 * (the default is `true`, see `confirm-payment.schema.ts`) is the owner's
 * dispute/undo path: flips the attendance back to `pending` and clears
 * `paidConfirmedById`.
 *
 * Authorization: strictly group-owner-only, via the same `assertMatchOwner`
 * primitive the matches CRUD (`cancel-match`, `update-match`) uses — no
 * self path here, since self-declaring is exactly what `mark-paid` is for.
 * Throws `MTC-T0001`/`GRP-T0001`/`GRP-T0002` (via `assertMatchOwner`) or
 * `ATT-T0002` if the attendance itself doesn't belong to this match.
 */
export function createConfirmPaymentService(deps: ConfirmPaymentDeps) {
  return async (
    matchId: string,
    attendanceId: string,
    userId: string,
    paid: boolean,
  ): Promise<Attendance> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, userId);

    const attendance = await deps.attendanceRepo.findById(matchId, attendanceId);
    if (!attendance) throw ERRORS.ATT.NOT_FOUND();

    return deps.attendanceRepo.setPayment(
      attendanceId,
      paid ? "paid" : "pending",
      paid ? userId : null,
    );
  };
}
