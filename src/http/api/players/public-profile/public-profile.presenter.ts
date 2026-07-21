import type { FieldPosition } from "@/http/api/groups/children/members/members.types";
import { zeroCounts, type ReputationCounts } from "@/http/api/matches/children/reputation/reputation.types";
import { overallByPositionFrom } from "@/http/api/players/players.rating";
import type { PlayerCareer } from "../children/career/career.types";
import { unlockedAchievements } from "../children/career/achievements";
import type { Player } from "../players.types";
import type { PublicProfileResponse } from "./public-profile.schema";

/**
 * Flattens `Player` + `PlayerCareer | null` into the public-safe card. When
 * `career` is `null` (registered player, no finalized match yet) synthesizes
 * the same zeroed/bootstrap-default numbers `career.presenter.ts` uses:
 * `level: "bronze"`, every counter at 0, `bestPosition: null`, `winRate: 0`.
 * `overallByPosition` is NEVER stored — like `career.presenter.ts` and
 * `me.presenter.ts`, it's always derived via `overallByPositionFrom` from the
 * evolved `attributes`/`affinity` (career's, or the player's own base ones
 * when no career row exists yet), so a brand-new player with declared
 * positions already sees a non-empty, non-zero `bestOverall` here — matching
 * home/sidebar instead of a flat zero.
 *
 * `counts` is the aggregate reputation-tag totals this player has RECEIVED
 * (`ReputationRepository.countsByPlayer` — Task 1), one number per
 * `REPUTATION_DIMENSIONS` key. Optional here (defaults to `zeroCounts()`)
 * so callers that don't fetch it (or a bare unit test) never crash; every
 * production caller passes it through from `public-profile.service.ts`.
 */
export function presentPublicProfile(
  player: Player,
  career: PlayerCareer | null,
  counts?: ReputationCounts,
): PublicProfileResponse {
  const attributes = career?.attributes ?? player.attributes;
  const affinity = career?.affinity ?? (player.affinity as PlayerCareer["affinity"]);
  const overallByPosition = overallByPositionFrom(attributes, affinity);

  let bestOverall = 0;
  let bestPosition: FieldPosition | null = null;
  for (const [position, value] of Object.entries(overallByPosition) as [FieldPosition, number][]) {
    if (value > bestOverall) {
      bestOverall = value;
      bestPosition = position;
    }
  }

  const matchesPlayed = career?.matchesPlayed ?? 0;
  const wins = career?.wins ?? 0;
  const winRate = matchesPlayed > 0 ? wins / matchesPlayed : 0;

  return {
    playerId: player.id,
    name: player.name,
    level: career?.level ?? "bronze",
    overallByPosition,
    bestOverall,
    bestPosition,
    matchesPlayed,
    wins,
    draws: career?.draws ?? 0,
    losses: career?.losses ?? 0,
    winRate,
    goals: career?.goals ?? 0,
    assists: career?.assists ?? 0,
    cleanSheets: career?.cleanSheets ?? 0,
    mvpCount: career?.mvpCount ?? 0,
    currentStreak: career?.currentStreak ?? 0,
    bestStreak: career?.bestStreak ?? 0,
    achievements: unlockedAchievements({
      matchesPlayed,
      wins,
      goals: career?.goals ?? 0,
      assists: career?.assists ?? 0,
      cleanSheets: career?.cleanSheets ?? 0,
      mvpCount: career?.mvpCount ?? 0,
      bestStreak: career?.bestStreak ?? 0,
    }),
    reputation: counts ?? zeroCounts(),
  };
}
