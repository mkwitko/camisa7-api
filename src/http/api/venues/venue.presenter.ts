import type { VenueResponse } from "./venue.schema";
import type { Venue } from "./venue.types";

/** Maps a domain `Venue` to the API response shape (currently a 1:1 flattening). */
export function presentVenue(venue: Venue): VenueResponse {
  return {
    id: venue.id,
    ownerId: venue.ownerId,
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
    address: venue.address,
    city: venue.city,
    amenities: venue.amenities as VenueResponse["amenities"],
    phone: venue.phone,
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
  };
}
