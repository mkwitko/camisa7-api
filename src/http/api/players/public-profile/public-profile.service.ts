import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import type { PlayerCareer } from "@/http/api/players/children/career/career.types";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import { ERRORS } from "@/shared/errors/catalog";

export type PublicProfileDeps = {
  playersRepo: PlayersRepository;
  careerRepo: PlayerCareerRepository;
};

export type PublicProfileResult = { player: Player; career: PlayerCareer | null };

/**
 * `GET /players/:playerId/public-profile` (F1-6) — the shareable "Strava
 * card". PUBLIC route (`config: { public: true }` on the controller, no
 * auth): the futebol-web renders this straight from a shared link.
 *
 * Only REGISTERED players (`Player.userId` set) have a public profile — a
 * GUEST (`userId IS NULL`, added by an organizer or via invite, no account
 * of their own) never opted into being publicly listed, so this throws the
 * SAME 404 (`ERRORS.PLR.NOT_PUBLIC()`) whether the caller can't tell "guest"
 * from "doesn't exist" — see that error's doc comment for why it's a
 * separate code from `NOT_FOUND` (unknown id) even though both are 404.
 *
 * A registered player with no `PlayerCareer` row yet (no finalized match has
 * ever recomputed one) is NOT a 404 — same "valid empty state" philosophy
 * `get-career.service.ts` uses: they exist, they just haven't played yet.
 * The presenter turns `career: null` into a zeroed/bootstrap-default card.
 *
 * PRIVACY / ENUMERATION NOTE: profiles are enumerable by `playerId` (a
 * uuid) — anyone who has (or guesses) the uuid can fetch this with no auth.
 * Accepted for a social sharing feature: uuids aren't practically guessable
 * (122 bits of randomness), and the projection returned is non-PII
 * aggregate career data only (no phone/email/userId/group membership/
 * per-match detail) — the same class of thing a Strava public profile or a
 * gamer tag leaderboard entry exposes. Do not widen this response without
 * revisiting that assumption.
 */
export function createGetPublicProfileService(deps: PublicProfileDeps) {
  return async (playerId: string): Promise<PublicProfileResult> => {
    const player = await deps.playersRepo.findById(playerId);
    if (!player) throw ERRORS.PLR.NOT_FOUND();
    if (player.userId === null) throw ERRORS.PLR.NOT_PUBLIC();

    const career = await deps.careerRepo.findByPlayer(playerId);
    return { player, career };
  };
}
