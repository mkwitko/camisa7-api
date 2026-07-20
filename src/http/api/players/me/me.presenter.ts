import type { FieldPosition } from "@/http/api/groups/children/members/members.types";
import { POSITION_WEIGHTS } from "@/http/api/players/players.catalog";
import { categoryOveralls, effectiveBase } from "@/http/api/players/players.rating";
import type { Player } from "@/http/api/players/players.types";
import type { MyPlayerResponse } from "./me.schema";

/**
 * Maps the caller's own `Player` to `MyPlayerResponse`, computing the derived
 * FIFA-style overalls read-only: per-category overall (from attributes), and
 * per declared position the affinity-modulated `effectiveBase` (its overall on
 * the card). `generalOverall` = the highest of those. Positions the player
 * hasn't declared (absent from `affinity`) don't appear.
 */
export function presentMyPlayer(player: Player): MyPlayerResponse {
  const overallByPosition: Partial<Record<FieldPosition, number>> = {};
  for (const key of Object.keys(player.affinity)) {
    if (!(key in POSITION_WEIGHTS)) continue;
    const pos = key as FieldPosition;
    overallByPosition[pos] = effectiveBase(player.attributes, pos, player.affinity[key] ?? 0);
  }
  const generalOverall = Object.values(overallByPosition).reduce(
    (best, v) => Math.max(best, v ?? 0),
    0,
  );

  return {
    id: player.id,
    name: player.name,
    slug: player.slug,
    phone: player.phone,
    userId: player.userId,
    avatarUrl: player.avatarUrl,
    affinity: player.affinity,
    attributes: player.attributes,
    skills: player.skills,
    dominantFoot: player.dominantFoot,
    weakFoot: player.weakFoot,
    skillMoves: player.skillMoves,
    heightCm: player.heightCm,
    weightKg: player.weightKg,
    birthYear: player.birthYear,
    preferredTeam: player.preferredTeam,
    nationality: player.nationality,
    categoryOverall: categoryOveralls(player.attributes),
    overallByPosition,
    generalOverall,
  };
}
