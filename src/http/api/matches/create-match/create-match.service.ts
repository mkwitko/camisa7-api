import type { BookingRepository } from "@/http/api/bookings/booking.repository";
import type { CourtRepository } from "@/http/api/courts/court.repository";
import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";
import type { CreateMatchBody } from "./create-match.schema";

export type CreateMatchDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  venueRepo: VenueRepository;
  bookingRepo: BookingRepository;
  courtRepo: CourtRepository;
};

export type CreateMatchInput = CreateMatchBody & { groupId: string; userId: string };

/**
 * Owner creates a `Match` inside their own group. Always starts `open`.
 *
 * Marketplace V1: when `venueId` is given, the match is linked to that `Venue`
 * and the venue becomes the source of location — its `latitude/longitude/city/
 * address` are copied onto the match, OVERRIDING any manual coords in the body.
 * An unknown `venueId` is rejected (`VEN.NOT_FOUND`); no ownership check on the
 * venue (an organizer may schedule a pelada at any venue, not only their own).
 *
 * Marketplace V2: when `bookingId` is given, the match is linked to that
 * `Booking` (`Match.bookingId`) and the booking's court's venue becomes the
 * source of location (booking → court → venue), same override semantics as
 * `venueId`. The booking must exist (`BKG.NOT_FOUND`) and be `confirmed`
 * (`BKG.BAD_STATE` otherwise), and must not already be linked to another match
 * — enforced by the DB's `Match.bookingId` unique constraint, surfaced as
 * `BKG.BAD_STATE` on a P2002 (see `MatchesRepository.insert`). It must also
 * belong to the caller (`booking.bookedById === userId`) — `BKG.NOT_ALLOWED`
 * (403) otherwise — an organizer links their OWN confirmed reservation, not
 * any confirmed booking by UUID. Precedence: when BOTH `venueId` and
 * `bookingId` are sent, the booking's venue wins — the booking is the source
 * of truth for which court was actually reserved.
 */
export function createCreateMatchService(deps: CreateMatchDeps) {
  return async (input: CreateMatchInput): Promise<Match> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    let location: {
      latitude: number | null;
      longitude: number | null;
      city: string | null;
      address: string | null;
      venueId: string | null;
    };
    let bookingId: string | null = null;

    if (input.bookingId !== undefined) {
      const booking = await deps.bookingRepo.findById(input.bookingId);
      if (!booking) throw ERRORS.BKG.NOT_FOUND();
      if (booking.bookedById !== input.userId) throw ERRORS.BKG.NOT_ALLOWED();
      if (booking.status !== "confirmed") throw ERRORS.BKG.BAD_STATE();
      bookingId = booking.id;

      const court = await deps.courtRepo.findByIdWithVenue(booking.courtId);
      location = {
        latitude: court?.venue.latitude ?? null,
        longitude: court?.venue.longitude ?? null,
        city: court?.venue.city ?? null,
        address: court?.venue.address ?? null,
        venueId: court?.venueId ?? null,
      };
    } else if (input.venueId !== undefined) {
      const venue = await deps.venueRepo.findById(input.venueId);
      if (!venue) throw ERRORS.VEN.NOT_FOUND();
      location = {
        latitude: venue.latitude,
        longitude: venue.longitude,
        city: venue.city,
        address: venue.address,
        venueId: venue.id,
      };
    } else {
      location = {
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        venueId: null,
      };
    }

    // Coords são obrigatórias — sem lat/lng a partida nunca apareceria no
    // Descobrir (o feed filtra por `latitude/longitude IS NOT NULL` + raio).
    // Venue/booking sempre resolvem coords; a criação manual precisa do mapa.
    if (location.latitude === null || location.longitude === null) {
      throw ERRORS.MTC.COORDS_REQUIRED();
    }

    return deps.matchesRepo.insert({
      groupId: input.groupId,
      datetime: input.datetime,
      location: input.location,
      priceCents: input.priceCents ?? 0,
      slots: input.slots,
      pixKey: input.pixKey ?? null,
      modality: input.modality,
      bookingId,
      ...location,
    });
  };
}
