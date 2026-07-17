import { type SkillKey, withAttributeDefaults } from "@/http/api/players/players.catalog";
import type { Player } from "@/http/api/players/players.types";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { createMatchesRepository } from "../../matches.repository";
import type { Attendance, AttendanceStatus, PaymentStatus } from "./attendance.types";

type AttendanceRow = {
  id: string;
  matchId: string;
  status: string;
  waitlistPos: number | null;
  paymentStatus: string;
  paidConfirmedById: string | null;
  player: {
    id: string;
    userId: string | null;
    name: string;
    phone: string | null;
    affinity: unknown;
    attributes: unknown;
    skills: string[];
  };
};

function toDomainAttendance(row: AttendanceRow): Attendance {
  return {
    id: row.id,
    matchId: row.matchId,
    player: {
      id: row.player.id,
      userId: row.player.userId,
      name: row.player.name,
      phone: row.player.phone,
      affinity: (row.player.affinity ?? {}) as Record<string, number>,
      attributes: withAttributeDefaults((row.player.attributes ?? {}) as Record<string, number>),
      skills: (row.player.skills ?? []) as SkillKey[],
    },
    status: row.status as AttendanceStatus,
    waitlistPos: row.waitlistPos,
    paymentStatus: row.paymentStatus as PaymentStatus,
    paidConfirmedById: row.paidConfirmedById,
  };
}

const ATTENDANCE_INCLUDE = { player: true } as const;

export interface AttendanceRepository {
  /**
   * Confirms `player`'s presence at `matchId` — `confirmed` if there's a
   * free slot (promoting the match to `full` if this was the last one),
   * `waitlisted` (next `waitlistPos`) otherwise. Throws `ERRORS.MTC.NOT_FOUND()`
   * if the match doesn't exist, `ERRORS.ATT.ALREADY_IN()` if `player` already
   * has an active (confirmed/waitlisted) row for this match.
   */
  confirm(matchId: string, player: Player): Promise<{ attendance: Attendance }>;
  /**
   * Cancels `attendanceId` (must belong to `matchId`). If it was `confirmed`,
   * promotes the waitlisted attendee with the lowest `waitlistPos` (if any)
   * to `confirmed` and shifts the rest down by one; sets the match back to
   * `open` if it was `full`. If it was `waitlisted`, just shifts the
   * following waitlisted attendees down by one (no promotion — no slot
   * freed). Cancelling an already-`cancelled` row is a no-op (idempotent,
   * mirrors `cancel-match`'s cancel semantics) — returns it as-is with
   * `promoted: null`, without re-running promotion. Throws
   * `ERRORS.MTC.NOT_FOUND()` if the match doesn't exist, `ERRORS.ATT.NOT_FOUND()`
   * if `attendanceId` doesn't belong to `matchId`.
   */
  cancelAndPromote(
    matchId: string,
    attendanceId: string,
  ): Promise<{ cancelled: Attendance; promoted: Attendance | null }>;
  /** All attendances (any status) for a match, oldest first. */
  listByMatch(matchId: string): Promise<Attendance[]>;
  /**
   * All attendances (any status) for one player, across every match —
   * mirrors `MatchStatsRepository.listByPlayer`/`VotesRepository.listByMatch`'s
   * "career-wide" shape. Feeds the F1-4 career-growth engine's replay: a
   * player's finalized match history is resolved by filtering this to
   * `status: "confirmed"`, then cross-referencing each match's own `status`
   * (`"closed"` = finalized, see `finalize-match`).
   */
  listByPlayer(playerId: string): Promise<Attendance[]>;
  /**
   * Looks up one attendance, scoped to `matchId` (mirrors `MembersRepository
   * .findInGroup`'s "scoped lookup" shape). Used by `cancel-presence` to load
   * the target row *before* cancelling it, so the service can authorize
   * (self or group-owner) ahead of the actual state transition.
   */
  findById(matchId: string, attendanceId: string): Promise<Attendance | null>;
  /** Task 8: records the attendee's PIX payment state (`setPayment` itself does no authz — the caller decides who may call it). */
  setPayment(
    attendanceId: string,
    status: PaymentStatus,
    confirmedById: string | null,
  ): Promise<Attendance>;
}

/**
 * Runs `fn` inside an interactive transaction: if `db` is the base client
 * (has `$transaction`), open one; if `db` is itself already a
 * `Prisma.TransactionClient` (composed inside a parent tx — e.g. Task 9's
 * guest confirm), just run `fn` directly against it (already atomic as part
 * of that parent transaction). Same pattern as `runAtomic` in
 * `members.repository.ts`.
 */
async function runInTransaction<T>(db: PrismaLike, fn: (tx: PrismaLike) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return db.$transaction((tx) => fn(tx));
  return fn(db);
}

/**
 * Locks the parent `Match` row (`SELECT ... FOR UPDATE`) — the first
 * statement of every state-transition transaction below. Prisma's
 * query-builder has no `FOR UPDATE` support; this is the raw-SQL escape
 * hatch, run inside the interactive transaction so the lock is held for its
 * whole duration (released on commit/rollback). Two concurrent
 * `confirm`/`cancelAndPromote` calls for the SAME match serialize on this
 * lock — the second call's `$queryRaw` blocks until the first transaction
 * commits, so it always sees the first call's committed slot/waitlist
 * state. This is what makes "two concurrent confirms both take the last
 * slot" impossible. Returns `true` iff the match exists.
 */
async function lockMatch(tx: PrismaLike, matchId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Match" WHERE id = ${matchId}::uuid FOR UPDATE`;
  return rows.length > 0;
}

/** Factory `createAttendanceRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createAttendanceRepository(db: PrismaLike): AttendanceRepository {
  return {
    async confirm(matchId, player) {
      return runInTransaction(db, async (tx) => {
        if (!(await lockMatch(tx, matchId))) throw ERRORS.MTC.NOT_FOUND();
        const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });

        const existingActive = await tx.attendance.findFirst({
          where: { matchId, playerId: player.id, status: { not: "cancelled" } },
        });
        if (existingActive) throw ERRORS.ATT.ALREADY_IN();

        const confirmedCount = await tx.attendance.count({
          where: { matchId, status: "confirmed" },
        });

        if (confirmedCount < match.slots) {
          const row = await tx.attendance.create({
            data: { matchId, playerId: player.id, status: "confirmed", waitlistPos: null },
            include: ATTENDANCE_INCLUDE,
          });

          if (confirmedCount + 1 === match.slots) {
            // `createMatchesRepository(tx)` is already bound to this same
            // `tx` — no need to pass it again as `setStatus`'s optional 3rd
            // arg (it defaults to the repo's own bound client).
            await createMatchesRepository(tx).setStatus(matchId, "full");
          }

          return { attendance: toDomainAttendance(row) };
        }

        const maxWaitlist = await tx.attendance.aggregate({
          where: { matchId, status: "waitlisted" },
          _max: { waitlistPos: true },
        });
        const nextPos = (maxWaitlist._max.waitlistPos ?? 0) + 1;

        const row = await tx.attendance.create({
          data: { matchId, playerId: player.id, status: "waitlisted", waitlistPos: nextPos },
          include: ATTENDANCE_INCLUDE,
        });
        return { attendance: toDomainAttendance(row) };
      });
    },

    async cancelAndPromote(matchId, attendanceId) {
      return runInTransaction(db, async (tx) => {
        if (!(await lockMatch(tx, matchId))) throw ERRORS.MTC.NOT_FOUND();
        const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });

        const target = await tx.attendance.findFirst({
          where: { id: attendanceId, matchId },
          include: ATTENDANCE_INCLUDE,
        });
        if (!target) throw ERRORS.ATT.NOT_FOUND();

        if (target.status === "cancelled") {
          return { cancelled: toDomainAttendance(target), promoted: null };
        }

        const wasConfirmed = target.status === "confirmed";
        const previousWaitlistPos = target.waitlistPos;

        const cancelledRow = await tx.attendance.update({
          where: { id: attendanceId },
          data: { status: "cancelled", waitlistPos: null },
          include: ATTENDANCE_INCLUDE,
        });

        let promoted: Attendance | null = null;

        if (wasConfirmed) {
          const nextInLine = await tx.attendance.findFirst({
            where: { matchId, status: "waitlisted" },
            orderBy: { waitlistPos: "asc" },
            include: ATTENDANCE_INCLUDE,
          });

          if (nextInLine) {
            const promotedRow = await tx.attendance.update({
              where: { id: nextInLine.id },
              data: { status: "confirmed", waitlistPos: null },
              include: ATTENDANCE_INCLUDE,
            });
            promoted = toDomainAttendance(promotedRow);

            await tx.attendance.updateMany({
              where: { matchId, status: "waitlisted" },
              data: { waitlistPos: { decrement: 1 } },
            });
            // The freed slot was immediately refilled by the promotion — the
            // match stays `full`, it never actually had an empty slot.
          } else if (match.status === "full") {
            // No one to promote — the slot is genuinely free again.
            await createMatchesRepository(tx).setStatus(matchId, "open");
          }
        } else if (previousWaitlistPos !== null) {
          // The cancelled attendee was itself waitlisted — no slot freed, no
          // promotion, but the following waitlisted attendees still need to
          // shift down to keep `waitlistPos` a contiguous 1-based sequence.
          await tx.attendance.updateMany({
            where: { matchId, status: "waitlisted", waitlistPos: { gt: previousWaitlistPos } },
            data: { waitlistPos: { decrement: 1 } },
          });
        }

        return { cancelled: toDomainAttendance(cancelledRow), promoted };
      });
    },

    async listByMatch(matchId) {
      const rows = await db.attendance.findMany({
        where: { matchId },
        include: ATTENDANCE_INCLUDE,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toDomainAttendance);
    },

    async listByPlayer(playerId) {
      const rows = await db.attendance.findMany({
        where: { playerId },
        include: ATTENDANCE_INCLUDE,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toDomainAttendance);
    },

    async findById(matchId, attendanceId) {
      const row = await db.attendance.findFirst({
        where: { id: attendanceId, matchId },
        include: ATTENDANCE_INCLUDE,
      });
      return row ? toDomainAttendance(row) : null;
    },

    async setPayment(attendanceId, status, confirmedById) {
      const row = await db.attendance.update({
        where: { id: attendanceId },
        data: { paymentStatus: status, paidConfirmedById: confirmedById },
        include: ATTENDANCE_INCLUDE,
      });
      return toDomainAttendance(row);
    },
  };
}
