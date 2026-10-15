import type { BookingMode } from "@/http/api/courts/court.types";

export type { BookingMode };

/** Domain `BookingStatus` — mirrors the Prisma `BookingStatus` enum. */
export type BookingStatus =
  | "requested"
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "expired";

/**
 * Domain `Booking` — not the Prisma row. One reserved slot on a `Court`,
 * booked by a `User` (`bookedById`). `date` is a `YYYY-MM-DD` string (the
 * domain never carries a `Date` for a date-only column — see the backend conventions
 * DATES.md); `startMinute`/`endMinute` are minutes since 00:00.
 * `priceCents` is captured at booking time (later price-rule edits don't
 * retroactively alter it). `depositCents` is only set when `mode ===
 * "deposit"`; `stripePaymentIntentId` correlates to the destination-charge
 * PaymentIntent once payment starts (`null` for `mode === "request"` until
 * it's approved, and always `null` while `status === "requested"`).
 */
export type Booking = {
  id: string;
  courtId: string;
  bookedById: string;
  date: string;
  startMinute: number;
  endMinute: number;
  priceCents: number;
  mode: BookingMode;
  status: BookingStatus;
  depositCents: number | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
};
