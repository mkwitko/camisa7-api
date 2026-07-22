import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { deriveLevel } from "@/http/api/players/children/career/career-engine";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import { generalOverallFrom } from "@/http/api/players/players.rating";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { SuggestionsRepository } from "./suggestions.repository";
import type { Suggestion } from "./suggestions.schema";

export type GetSuggestionsDeps = {
  authRepo: AuthRepository;
  playersRepo: PlayersRepository;
  careerRepo: PlayerCareerRepository;
  suggestionsRepo: SuggestionsRepository;
};

export type GetSuggestionsInput = {
  radiusKm: number;
  limit: number;
};

/** A brand-new candidate/caller with no `PlayerCareer` row yet — the full 50-baseline attribute map and no declared affinity, same "zeroed" reading `public-profile.presenter.ts`/`me.presenter.ts` fall back to. */
const BASELINE_ATTRIBUTES = withAttributeDefaults({});
const BASELINE_AFFINITY: Partial<Record<string, number>> = {};

/** `round(distanceKm)` — the "km bucket" candidates are primarily grouped by before breaking ties on overall closeness (see `run`'s sort comment). */
function kmBucket(distanceKm: number): number {
  return Math.round(distanceKm);
}

/**
 * `GET /players/suggestions` — nearby players ranked by similar level.
 * Deps-injected (`authRepo`/`playersRepo`/`careerRepo`/`suggestionsRepo`) so
 * the controller (Task 2) composes real Prisma-backed repos while tests
 * mock this interface directly (TDD, no Testcontainers needed for the
 * ranking logic itself — see `suggestions.repository.test.ts` for the raw
 * SQL's own integration coverage).
 */
export function createGetSuggestionsService(deps: GetSuggestionsDeps) {
  return {
    async run(userId: string, input: GetSuggestionsInput): Promise<Suggestion[]> {
      const user = await deps.authRepo.findById(userId);
      if (!user || user.lastLat == null || user.lastLng == null) return [];

      const myPlayer = await deps.playersRepo.findOrCreateForUser(userId);
      const myCareer = await deps.careerRepo.findByPlayer(myPlayer.id);
      const myAttributes = myCareer?.attributes ?? myPlayer.attributes;
      const myAffinity = myCareer?.affinity ?? myPlayer.affinity;
      const myOverall = generalOverallFrom(myAttributes, myAffinity);

      const candidates = await deps.suggestionsRepo.nearbyCandidates({
        meUserId: userId,
        myPlayerId: myPlayer.id,
        lat: user.lastLat,
        lng: user.lastLng,
        radiusKm: input.radiusKm,
        take: input.limit * 3,
      });

      const ranked = candidates.map((candidate) => {
        const attributes =
          (candidate.attributes as Record<string, number> | null) ?? BASELINE_ATTRIBUTES;
        const affinity =
          (candidate.affinity as Partial<Record<string, number>> | null) ?? BASELINE_AFFINITY;
        const overall = generalOverallFrom(attributes, affinity);
        return {
          playerId: candidate.playerId,
          name: candidate.name,
          avatarUrl: candidate.avatarUrl,
          city: candidate.city,
          distanceKm: candidate.distanceKm,
          overall,
          level: deriveLevel(attributes, affinity),
        } satisfies Suggestion;
      });

      // Nearest-first primarily (grouped into whole-km buckets so two
      // candidates a few hundred meters apart don't out-rank a much closer
      // level match on a technicality), then closest to the caller's own
      // overall within the same bucket. `Array#sort` is stable (ES2019+),
      // so candidates already tied on both keys keep the repo's own
      // nearest-first order.
      ranked.sort((a, b) => {
        const bucketDiff = kmBucket(a.distanceKm) - kmBucket(b.distanceKm);
        if (bucketDiff !== 0) return bucketDiff;
        return Math.abs(a.overall - myOverall) - Math.abs(b.overall - myOverall);
      });

      return ranked.slice(0, input.limit);
    },
  };
}
