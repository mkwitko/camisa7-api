import type { BookingResponse } from "./booking.schema";
import type { Booking } from "./booking.types";

/** Maps a domain `Booking` to the API response shape. */
export function presentBooking(booking: Booking): BookingResponse {
  return {
    id: booking.id,
    courtId: booking.courtId,
    bookedById: booking.bookedById,
    date: booking.date,
    startMinute: booking.startMinute,
    endMinute: booking.endMinute,
    priceCents: booking.priceCents,
    mode: booking.mode,
    status: booking.status,
    depositCents: booking.depositCents,
    stripePaymentIntentId: booking.stripePaymentIntentId,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}
