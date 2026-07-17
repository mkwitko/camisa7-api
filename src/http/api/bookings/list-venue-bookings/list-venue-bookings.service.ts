import { assertVenueOwner } from "@/http/api/venues/venue.authz";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import type { BookingRepository } from "../booking.repository";
import type { Booking } from "../booking.types";

export type ListVenueBookingsDeps = {
  bookingRepo: BookingRepository;
  venueRepo: VenueRepository;
};

export type ListVenueBookingsInput = {
  venueId: string;
  userId: string;
  from: string;
  to: string;
};

/**
 * `GET /venues/:id/bookings?from&to` — the owner's agenda view across every
 * court of the venue. `assertVenueOwner` is the REAL authorization (404
 * unknown / 403 not owner), same as `update-venue`/`set-price-rules`.
 */
export function createListVenueBookingsService(deps: ListVenueBookingsDeps) {
  return async (input: ListVenueBookingsInput): Promise<Booking[]> => {
    const venue = await deps.venueRepo.findById(input.venueId);
    assertVenueOwner(venue, input.userId);

    return deps.bookingRepo.listByVenueRange(input.venueId, input.from, input.to);
  };
}
