import type { Court, PriceRule } from "@/http/api/courts/court.types";

export type AvailabilitySlot = {
  startMinute: number;
  endMinute: number;
  priceCents: number;
  available: boolean;
};

/**
 * Pure: expands a `Court`'s `priceRules` into its fixed `slotMinutes` grid
 * for a single `date`, then marks each slot `available` against
 * `activeStartMinutes` (the `startMinute`s of that court+date's ACTIVE
 * bookings — see `BookingRepository.activeSlotsFor`).
 *
 * Only rules matching `date`'s weekday (`0`=Sun..`6`=Sat, `Date#getUTCDay`
 * over a `T00:00:00.000Z` parse — matches `Booking.date`'s `@db.Date`
 * round-trip) contribute slots. Each rule expands into consecutive
 * `[start, start + court.slotMinutes)` windows starting at
 * `rule.startMinute`, stopping once a full slot no longer fits before
 * `rule.endMinute` — a rule whose span isn't an exact multiple of
 * `slotMinutes` simply drops its trailing partial slot. No matching rule (or
 * an empty `priceRules`) yields `[]`. Two overlapping rules for the same
 * weekday (not supposed to happen — `assertNoOverlap` guards writes) would
 * produce duplicate/overlapping slots here; this function doesn't
 * deduplicate.
 */
export function computeAvailability(
  court: Pick<Court, "slotMinutes">,
  priceRules: readonly PriceRule[],
  date: string,
  activeStartMinutes: readonly number[],
): AvailabilitySlot[] {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const occupied = new Set(activeStartMinutes);

  const slots: AvailabilitySlot[] = [];
  for (const rule of priceRules) {
    if (rule.weekday !== weekday) continue;
    for (
      let start = rule.startMinute;
      start + court.slotMinutes <= rule.endMinute;
      start += court.slotMinutes
    ) {
      slots.push({
        startMinute: start,
        endMinute: start + court.slotMinutes,
        priceCents: rule.priceCents,
        available: !occupied.has(start),
      });
    }
  }

  return slots.sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * Resolves the `priceCents` for a candidate `[startMinute, endMinute)` slot
 * by checking it's an EXACT match in the grid `computeAvailability` would
 * generate for that `date` (ignoring occupancy — pass `[]` for
 * `activeStartMinutes`) — i.e. it both falls inside some price-rule window
 * AND is aligned to `court.slotMinutes`. Returns `null` when there's no
 * match (`create-booking.service.ts` maps that to
 * `ERRORS.BKG.SLOT_NOT_BOOKABLE()`).
 */
export function resolveSlotPrice(
  court: Pick<Court, "slotMinutes">,
  priceRules: readonly PriceRule[],
  date: string,
  startMinute: number,
  endMinute: number,
): number | null {
  const match = computeAvailability(court, priceRules, date, []).find(
    (slot) => slot.startMinute === startMinute && slot.endMinute === endMinute,
  );
  return match ? match.priceCents : null;
}
