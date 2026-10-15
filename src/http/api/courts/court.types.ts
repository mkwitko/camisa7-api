import type { Modality } from "@/http/api/matches/matches.types";

export type { Modality };

/** Domain `BookingMode` — mirrors the Prisma `BookingMode` enum. */
export type BookingMode = "instant" | "request" | "deposit";

/**
 * Domain `Court` — not the Prisma row. A playing surface inside a `Venue`
 * (Marketplace V2), with its own booking mode and fixed slot grid
 * (`slotMinutes`). `depositPercent` is only meaningful when
 * `bookingMode === "deposit"` (1..100), `null` otherwise. `createdAt`/
 * `updatedAt` are ISO 8601 strings (domain types carry `string`, not `Date`
 * — see the backend conventions DATES.md).
 */
export type Court = {
  id: string;
  venueId: string;
  name: string;
  modality: Modality;
  surface: string | null;
  slotMinutes: number;
  bookingMode: BookingMode;
  depositPercent: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Domain `PriceRule` — a `CourtPriceRule` row. One weekday+time-window price
 * band; `[startMinute, endMinute)` is a half-open interval measured in
 * minutes since 00:00. A court may have several rules (e.g. weekday daytime
 * vs. weekend night); resolved at booking time by matching the slot's
 * weekday + startMinute against these windows.
 */
export type PriceRule = {
  id: string;
  courtId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  priceCents: number;
};

/** `Court` with its `priceRules` attached — the shape `CourtResponse` presents. */
export type CourtWithPriceRules = Court & { priceRules: PriceRule[] };

/**
 * `Court` joined with its parent `Venue`'s `ownerId` — the minimal shape
 * `assertCourtOwner` needs to authorize a mutation without a second query.
 *
 * Marketplace V2 (B9): the venue's `latitude/longitude/city/address` are also
 * selected — `create-match`'s booking-link path (booking → court → venue)
 * needs them to copy the venue's location onto the match. Optional (rather
 * than widening every existing `CourtWithVenue` fixture across the courts/
 * bookings tests) since only that path reads them.
 */
export type CourtWithVenue = Court & {
  venue: {
    ownerId: string;
    latitude?: number;
    longitude?: number;
    city?: string;
    address?: string;
  };
};
