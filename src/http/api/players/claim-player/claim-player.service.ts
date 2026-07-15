import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import type { ClaimMergeSummary, ClaimPlayerRepository } from "./claim-player.repository";

export type ClaimPlayerDeps = {
  playersRepo: PlayersRepository;
  claimRepo: ClaimPlayerRepository;
  careerRepo: PlayerCareerRepository;
};

export type ClaimPlayerResult = { player: Player; summary: ClaimMergeSummary };

/**
 * Guest→account merge (F1-5, design doc §3 / §5.2 step 13): the caller
 * claims every GUEST `Player` (`userId IS NULL`) whose `phone` matches the
 * submitted one, merging that guest's ENTIRE match history (attendances,
 * stats, votes cast/received, group memberships) into the caller's own
 * canonical `Player` (`findOrCreateForUser` — reused/created exactly like
 * every other flow that resolves "this user's `Player`").
 *
 * SECURITY (Fase 1 MVP, disclosed per the design doc — not a silent gap):
 * this claim is authorized by PHONE MATCH ALONE. There is no OTP, no SMS/
 * WhatsApp verification loop, no organizer vouching for "yes, this guest is
 * really you." Any authenticated user who knows (or guesses) a phone number
 * a guest registered with — visible to anyone in the same WhatsApp group,
 * for instance — can claim that guest's full history as their own. This is
 * an accepted, documented tradeoff for a closed-group friendly-pelada MVP
 * with no money/ranking stakes riding on it; it is NOT safe to ship as-is
 * for a product where identity theft of match history has real
 * consequences. A real launch needs phone/OTP verification (e.g. SMS code
 * to the claimed number) or an organizer-vouched link before merging.
 *
 * No guest matching `phone` → NOT an error: returns the caller's canonical
 * player with a zeroed summary (`guestsMerged: 0`, same "valid empty state,
 * not 404" philosophy `get-career.service.ts` uses for a brand-new player).
 * The career recompute only runs when at least one guest was actually
 * merged — a no-op claim shouldn't manufacture a `PlayerCareer` row (or
 * needlessly re-touch an existing one) for nothing.
 */
export function createClaimPlayerService(deps: ClaimPlayerDeps) {
  return async (userId: string, phone: string): Promise<ClaimPlayerResult> => {
    const canonical = await deps.playersRepo.findOrCreateForUser(userId);
    const summary = await deps.claimRepo.claimByPhone(phone, canonical.id);

    if (summary.guestsMerged > 0) {
      await deps.careerRepo.recomputeForPlayer(canonical.id);
    }

    return { player: canonical, summary };
  };
}
