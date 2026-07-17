import type { CourtResponse, PriceRuleResponse } from "./court.schema";
import type { CourtWithPriceRules, PriceRule } from "./court.types";

function presentPriceRule(rule: PriceRule): PriceRuleResponse {
  return {
    weekday: rule.weekday,
    startMinute: rule.startMinute,
    endMinute: rule.endMinute,
    priceCents: rule.priceCents,
  };
}

/** Maps a domain `Court` (+ its `priceRules`) to the API response shape. */
export function presentCourt(court: CourtWithPriceRules): CourtResponse {
  return {
    id: court.id,
    venueId: court.venueId,
    name: court.name,
    modality: court.modality,
    surface: court.surface,
    slotMinutes: court.slotMinutes,
    bookingMode: court.bookingMode,
    depositPercent: court.depositPercent,
    active: court.active,
    priceRules: court.priceRules.map(presentPriceRule),
    createdAt: court.createdAt,
    updatedAt: court.updatedAt,
  };
}
