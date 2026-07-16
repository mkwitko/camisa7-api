import { competencyMonth } from "@/http/api/dues/competency";
import type { DuesRepository } from "@/http/api/dues/dues.repository";
import type { BillingMode } from "@/http/api/dues/dues.types";
import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../../../matches.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { AttendanceListItem, MonthlyDueStatus } from "../attendance.types";

export type ListAttendanceDeps = {
  attendanceRepo: AttendanceRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  duesRepo: DuesRepository;
};

/**
 * Resolves `player`'s `monthlyDueStatus` given their `billingMode` and the
 * group/month's dues, indexed by `groupMemberId`. `avulso` never has
 * membership dues — always `"none"`. `mensalista` maps the due's own
 * `status` when one exists for the month; a missing due (not yet
 * generated, e.g. a mid-month signup ahead of the monthly job) is treated
 * as owed, same as `"pending"` — see `MonthlyDueStatus`'s doc comment.
 */
function resolveMonthlyDueStatus(
  billingMode: BillingMode,
  groupMemberId: string | undefined,
  dueStatusByMember: Map<string, "paid" | "pending">,
): MonthlyDueStatus {
  if (billingMode === "avulso") return "none";
  if (!groupMemberId) return "pending";
  return dueStatusByMember.get(groupMemberId) ?? "pending";
}

/**
 * Lists every attendance (any status) for a match, oldest first, each
 * enriched with the attendee's DERIVED group billing context (Task 7 —
 * `billingMode` + `monthlyDueStatus`, see `AttendanceListItem`). Nothing
 * here is persisted: it's computed fresh from the match's group members
 * (for `billingMode`) and that group's current-month `MembershipDue`s (for
 * `monthlyDueStatus`), both loaded once up front — O(1) extra queries
 * regardless of roster size, not one lookup per attendee.
 *
 * `now` is injected (the HTTP boundary passes `new Date()`) so the
 * competency-month resolution stays deterministic/testable, mirroring
 * `competencyMonth`'s own contract.
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
  return async (matchId: string, userId: string, now: Date): Promise<AttendanceListItem[]> => {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    const isOwner = group?.ownerId === userId;
    if (!isOwner) {
      const isMember = await deps.membersRepo.isUserInGroup(match.groupId, userId);
      if (!isMember) throw ERRORS.ATT.CANNOT_MANAGE();
    }

    const attendances = await deps.attendanceRepo.listByMatch(matchId);

    const members = await deps.membersRepo.listByGroup(match.groupId);
    const memberByPlayerId = new Map(members.map((member) => [member.player.id, member]));

    const month = competencyMonth(now);
    const dues = await deps.duesRepo.listByGroupMonth(match.groupId, month);
    const dueStatusByMember = new Map(dues.map((due) => [due.groupMemberId, due.status]));

    return attendances.map((attendance) => {
      const member = memberByPlayerId.get(attendance.player.id);
      const billingMode: BillingMode = member?.billingMode ?? "avulso";
      const monthlyDueStatus = resolveMonthlyDueStatus(billingMode, member?.id, dueStatusByMember);
      return { ...attendance, billingMode, monthlyDueStatus };
    });
  };
}
