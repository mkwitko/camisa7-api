import { overallByPositionFrom } from "@/http/api/players/players.rating";
import type { Player } from "../../players.types";
import { unlockedAchievements } from "./achievements";
import type { PlayerCareerResponse } from "./career.schema";
import type { PlayerCareer } from "./career.types";

/**
 * Flattens a domain `PlayerCareer` into the API response shape — or, when
 * `career` is `null` (no finalized match has ever recomputed one for this
 * player yet), synthesizes the zeroed/bootstrap-default body `get-career`
 * returns instead of a 404 (see that service's doc comment): zeroed
 * counters, `level: "bronze"` (the engine's own floor for an untouched
 * career, see `career-engine.ts`'s `deriveLevel`), and `id`/`updatedAt` both
 * `null`. `overall` is NEVER stored — it's always derived here via
 * `overallByPositionFrom`, from the career's evolved `attributes`/`affinity`
 * when one exists, or bootstrapped straight from the `Player`'s own base
 * `attributes`/`affinity` when it doesn't — so a brand-new player sees the
 * same number on the home screen as on the sidebar before ever playing a
 * finalized match.
 */
export function presentPlayerCareer(
  player: Player,
  career: PlayerCareer | null,
): PlayerCareerResponse {
  const attributes = career?.attributes ?? player.attributes;
  const affinity = career?.affinity ?? (player.affinity as PlayerCareer["affinity"]);
  const overall = overallByPositionFrom(attributes, affinity);

  const counters = {
    matchesPlayed: career?.matchesPlayed ?? 0,
    wins: career?.wins ?? 0,
    draws: career?.draws ?? 0,
    losses: career?.losses ?? 0,
    goals: career?.goals ?? 0,
    assists: career?.assists ?? 0,
    cleanSheets: career?.cleanSheets ?? 0,
    mvpCount: career?.mvpCount ?? 0,
    currentStreak: career?.currentStreak ?? 0,
    bestStreak: career?.bestStreak ?? 0,
  };

  return {
    id: career?.id ?? null,
    playerId: player.id,
    overall,
    affinity,
    level: career?.level ?? "bronze",
    ...counters,
    achievements: unlockedAchievements({
      matchesPlayed: counters.matchesPlayed,
      wins: counters.wins,
      goals: counters.goals,
      assists: counters.assists,
      cleanSheets: counters.cleanSheets,
      mvpCount: counters.mvpCount,
      bestStreak: counters.bestStreak,
    }),
    updatedAt: career?.updatedAt ?? null,
  };
}
