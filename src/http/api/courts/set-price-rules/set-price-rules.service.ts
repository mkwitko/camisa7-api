import { assertCourtOwner } from "../court.authz";
import { assertNoOverlap } from "../court.price-rules";
import type { CourtRepository } from "../court.repository";
import type { SetPriceRulesBody } from "../court.schema";
import type { CourtWithPriceRules } from "../court.types";

export type SetPriceRulesDeps = { courtRepo: CourtRepository };

export type SetPriceRulesInput = {
  courtId: string;
  userId: string;
  body: SetPriceRulesBody;
};

/**
 * Owner-only replace-all of a `Court`'s price rules (`assertCourtOwner`).
 * `assertNoOverlap` validates the WHOLE incoming batch before writing
 * anything — an overlapping batch throws `CRT.INVALID_PRICE_RULES` (422)
 * without touching the DB, so the court's existing rules stay intact.
 */
export function createSetPriceRulesService(deps: SetPriceRulesDeps) {
  return async (input: SetPriceRulesInput): Promise<CourtWithPriceRules> => {
    const existing = await deps.courtRepo.findByIdWithVenue(input.courtId);
    const { venue: _venue, ...court } = assertCourtOwner(existing, input.userId);

    assertNoOverlap(input.body.rules);

    const priceRules = await deps.courtRepo.replacePriceRules(input.courtId, input.body.rules);
    return { ...court, priceRules };
  };
}
