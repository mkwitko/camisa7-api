import type { BookingRepository } from "../booking.repository";
import type { Booking } from "../booking.types";

export type ListMyBookingsDeps = { bookingRepo: BookingRepository };

/** Lists the caller's own bookings (as booker) — the app's "minhas reservas" screen. Most recent date first. */
export function createListMyBookingsService(deps: ListMyBookingsDeps) {
  return async (userId: string): Promise<Booking[]> => deps.bookingRepo.listByBooker(userId);
}
