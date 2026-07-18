import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { Booking, BookingMode, BookingStatus } from "./booking.types";

type BookingRow = {
  id: string;
  courtId: string;
  bookedById: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  priceCents: number;
  mode: BookingMode;
  status: BookingStatus;
  depositCents: number | null;
  stripePaymentIntentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** `Booking.date` is `@db.Date` — round-trips as UTC midnight, so a plain `YYYY-MM-DD` slice is lossless. */
function toDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDomainBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    courtId: row.courtId,
    bookedById: row.bookedById,
    date: fromDateOnly(row.date),
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    priceCents: row.priceCents,
    mode: row.mode,
    status: row.status,
    depositCents: row.depositCents ?? null,
    stripePaymentIntentId: row.stripePaymentIntentId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The `BookingStatus` values the `Booking_slot_active_uniq` partial unique index covers — mirrors the migration's `WHERE` clause. */
const ACTIVE_STATUSES: BookingStatus[] = ["requested", "pending_payment", "confirmed", "completed"];

export type InsertBookingInput = {
  courtId: string;
  bookedById: string;
  date: string;
  startMinute: number;
  endMinute: number;
  priceCents: number;
  mode: BookingMode;
  status: BookingStatus;
  depositCents?: number | null | undefined;
};

export interface BookingRepository {
  /**
   * Throws `ERRORS.BKG.SLOT_UNAVAILABLE()` (409) on a P2002 against
   * `Booking_slot_active_uniq` — the double-booking guard (mirrors
   * `auth.repository.insert`'s `EMAIL_TAKEN` mapping).
   */
  insert(input: InsertBookingInput): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  findByPaymentIntentId(paymentIntentId: string): Promise<Booking | null>;
  /** A booker's own bookings, most recent date first. */
  listByBooker(userId: string): Promise<Booking[]>;
  /** All bookings for a `Venue`'s courts within `[from, to]` (inclusive, `YYYY-MM-DD`) — the owner's agenda view. */
  listByVenueRange(venueId: string, from: string, to: string): Promise<Booking[]>;
  setStatus(id: string, status: BookingStatus): Promise<Booking>;
  /**
   * Atomic guarded transition — `UPDATE ... WHERE id = ? AND status IN
   * (fromStatuses)`. Returns the number of rows moved: `1` on success, `0`
   * if the booking wasn't in an allowed `from` status (someone else already
   * transitioned it — a concurrent/retried lifecycle call). Callers CLAIM
   * the row with this BEFORE any side effect (e.g. creating a Stripe
   * PaymentIntent) so two racing calls can't both pass a stale
   * check-then-write and both act; only the caller that gets `count === 1`
   * proceeds, the other throws `BKG.BAD_STATE()`.
   */
  transitionStatus(id: string, fromStatuses: BookingStatus[], toStatus: BookingStatus): Promise<number>;
  setPaymentIntent(id: string, paymentIntentId: string): Promise<Booking>;
  /** `startMinute`s of a court's ACTIVE bookings on `date` — what `computeAvailability` needs to mark slots unavailable. */
  activeSlotsFor(courtId: string, date: string): Promise<number[]>;
  /**
   * Best-effort expiry sweep (`expire-bookings.job.ts`) — two scoped
   * `updateMany`s, each restricted to a single `from` status so it can never
   * touch `confirmed`/`cancelled`/etc: `pending_payment` created before
   * `pendingBefore` and `requested` created before `requestedBefore` both
   * move to `expired`. Returns each bucket's row count for logging.
   */
  expireStale(pendingBefore: Date, requestedBefore: Date): Promise<{ pendingExpired: number; requestedExpired: number }>;
}

/** Factory `createBookingRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createBookingRepository(db: PrismaLike): BookingRepository {
  return {
    async insert(input) {
      try {
        const row = await db.booking.create({
          data: {
            courtId: input.courtId,
            bookedById: input.bookedById,
            date: toDateOnly(input.date),
            startMinute: input.startMinute,
            endMinute: input.endMinute,
            priceCents: input.priceCents,
            mode: input.mode,
            status: input.status,
            depositCents: input.depositCents ?? null,
          },
        });
        return toDomainBooking(row);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw ERRORS.BKG.SLOT_UNAVAILABLE();
        }
        throw error;
      }
    },

    async findById(id) {
      const row = await db.booking.findUnique({ where: { id } });
      return row ? toDomainBooking(row) : null;
    },

    async findByPaymentIntentId(paymentIntentId) {
      const row = await db.booking.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
      return row ? toDomainBooking(row) : null;
    },

    async listByBooker(userId) {
      const rows = await db.booking.findMany({
        where: { bookedById: userId },
        orderBy: { date: "desc" },
      });
      return rows.map(toDomainBooking);
    },

    async listByVenueRange(venueId, from, to) {
      const rows = await db.booking.findMany({
        where: {
          court: { venueId },
          date: { gte: toDateOnly(from), lte: toDateOnly(to) },
        },
        orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      });
      return rows.map(toDomainBooking);
    },

    async setStatus(id, status) {
      const row = await db.booking.update({ where: { id }, data: { status } });
      return toDomainBooking(row);
    },

    async transitionStatus(id, fromStatuses, toStatus) {
      const result = await db.booking.updateMany({
        where: { id, status: { in: fromStatuses } },
        data: { status: toStatus },
      });
      return result.count;
    },

    async setPaymentIntent(id, paymentIntentId) {
      const row = await db.booking.update({
        where: { id },
        data: { stripePaymentIntentId: paymentIntentId },
      });
      return toDomainBooking(row);
    },

    async activeSlotsFor(courtId, date) {
      const rows = await db.booking.findMany({
        where: { courtId, date: toDateOnly(date), status: { in: ACTIVE_STATUSES } },
        select: { startMinute: true },
      });
      return rows.map((row) => row.startMinute);
    },

    async expireStale(pendingBefore, requestedBefore) {
      const pending = await db.booking.updateMany({
        where: { status: "pending_payment", createdAt: { lt: pendingBefore } },
        data: { status: "expired" },
      });
      const requested = await db.booking.updateMany({
        where: { status: "requested", createdAt: { lt: requestedBefore } },
        data: { status: "expired" },
      });
      return { pendingExpired: pending.count, requestedExpired: requested.count };
    },
  };
}
