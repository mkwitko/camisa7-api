import type { PlayerCareer } from "@/http/api/players/children/career/career.types";
import {
  categoryOveralls,
  generalOverallFrom,
  overallByPositionFrom,
} from "@/http/api/players/players.rating";
import type { Player } from "@/http/api/players/players.types";
import type { MyPlayerResponse } from "./me.schema";

/**
 * Maps the caller's own `Player` (+ their `PlayerCareer`, if any) to
 * `MyPlayerResponse`. `attributes` on the wire stays the player's BASE
 * attributes — the profile editor PATCHes this field and it must keep
 * summing to the fixed budget. The derived overalls (`categoryOverall`,
 * `overallByPosition`, `generalOverall`) instead read off the EVOLVED
 * attributes (`career?.attributes ?? player.attributes`), so the sidebar
 * card matches what the home screen shows after career growth. No career
 * row yet (brand-new player) falls back to the base attributes, same as
 * before career tracking existed.
 */
export function presentMyPlayer(player: Player, career: PlayerCareer | null): MyPlayerResponse {
  const evolved = career?.attributes ?? player.attributes;

  return {
    id: player.id,
    name: player.name,
    slug: player.slug,
    phone: player.phone,
    userId: player.userId,
    avatarUrl: player.avatarUrl,
    affinity: player.affinity,
    attributes: player.attributes, // BASE — the editor PATCHes this (fixed budget)
    skills: player.skills,
    dominantFoot: player.dominantFoot,
    weakFoot: player.weakFoot,
    skillMoves: player.skillMoves,
    heightCm: player.heightCm,
    weightKg: player.weightKg,
    birthYear: player.birthYear,
    preferredTeam: player.preferredTeam,
    nationality: player.nationality,
    categoryOverall: categoryOveralls(evolved),
    overallByPosition: overallByPositionFrom(evolved, player.affinity),
    generalOverall: generalOverallFrom(evolved, player.affinity),
  };
}
