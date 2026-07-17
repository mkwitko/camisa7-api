import { ERRORS } from "@/shared/errors/catalog";
import { assertCourtOwner } from "../court.authz";
import type { CourtRepository } from "../court.repository";
import type { UpdateCourtBody } from "../court.schema";
import type { CourtWithPriceRules } from "../court.types";

export type UpdateCourtDeps = { courtRepo: CourtRepository };

export type UpdateCourtInput = {
  courtId: string;
  userId: string;
  patch: UpdateCourtBody;
};

/**
 * Owner-only update of a `Court` (`assertCourtOwner`, via the parent
 * `Venue.ownerId`). `bookingMode` ending up `"deposit"` (whether the patch
 * sets it explicitly or the court already was) requires a resolved
 * `depositPercent` — either freshly supplied in THIS patch, or already on
 * the court and not being cleared. Can't be a schema-level `.refine` (unlike
 * `CreateCourtBody`) because a PATCH may omit `bookingMode` entirely and the
 * check needs the court's *current* state, not just the patch.
 */
export function createUpdateCourtService(deps: UpdateCourtDeps) {
  return async (input: UpdateCourtInput): Promise<CourtWithPriceRules> => {
    const existing = await deps.courtRepo.findByIdWithVenue(input.courtId);
    const { venue: _venue, ...court } = assertCourtOwner(existing, input.userId);

    const nextBookingMode = input.patch.bookingMode ?? court.bookingMode;
    const nextDepositPercent =
      input.patch.depositPercent !== undefined ? input.patch.depositPercent : court.depositPercent;
    if (nextBookingMode === "deposit" && nextDepositPercent == null) {
      throw ERRORS.CRT.DEPOSIT_PERCENT_REQUIRED();
    }

    const updated = await deps.courtRepo.update(input.courtId, input.patch);
    const priceRules = await deps.courtRepo.listPriceRules(input.courtId);
    return { ...updated, priceRules };
  };
}
