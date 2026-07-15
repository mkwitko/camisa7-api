import type { PlayerCareerResponse } from "./career.schema";
import type { PlayerCareer } from "./career.types";

/**
 * Flattens a domain `PlayerCareer` into the API response shape — or, when
 * `career` is `null` (no finalized match has ever recomputed one for this
 * player yet), synthesizes the zeroed/bootstrap-default body `get-career`
 * returns instead of a 404 (see that service's doc comment): empty
 * `overall`/`affinity`, `level: "bronze"` (the engine's own floor for an
 * untouched career, see `career-engine.ts`'s `deriveLevel`), every counter
 * at 0, and `id`/`updatedAt` both `null`.
 */
export function presentPlayerCareer(
  playerId: string,
  career: PlayerCareer | null,
): PlayerCareerResponse {
  if (!career) {
    return {
      id: null,
      playerId,
      overall: {},
      affinity: {},
      level: "bronze",
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      mvpCount: 0,
      currentStreak: 0,
      bestStreak: 0,
      updatedAt: null,
    };
  }

  return {
    id: career.id,
    playerId: career.playerId,
    overall: career.overall,
    affinity: career.affinity,
    level: career.level,
    matchesPlayed: career.matchesPlayed,
    wins: career.wins,
    draws: career.draws,
    losses: career.losses,
    goals: career.goals,
    assists: career.assists,
    cleanSheets: career.cleanSheets,
    mvpCount: career.mvpCount,
    currentStreak: career.currentStreak,
    bestStreak: career.bestStreak,
    updatedAt: career.updatedAt,
  };
}
