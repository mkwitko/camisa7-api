import type { Position } from "@/http/api/groups/children/members/members.types";

/**
 * A confirmed attendee with no declared affinity at all (e.g. a guest who
 * joined via the public invite flow and never self-rated) gets a neutral
 * default — shared by `generate-teams` and `update-teams` so both land on
 * the same effective overall for the same player.
 */
export const DEFAULT_PRIMARY_POS: Position = "meia";
export const DEFAULT_OVERALL = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * FM rating model (Bloco A): a player self-declares an `affinity`
 * (`{position: 0-100}`) and accrues a per-position `overall` (`0-99`) from
 * match stats (the career engine). For team balancing we pick the position
 * where the player is most valuable = **argmax(affinity × effective overall)**,
 * and use that position's overall.
 *
 * - `effOverall[pos] = careerOverall[pos] ?? clamp(affinity[pos], 0, 99)` —
 *   the self-declared affinity BOOTSTRAPS the overall until real stats exist
 *   (replaces the old organizer `seedOverall`).
 * - Only positions with `affinity > 0` are candidates (the declared set).
 * - No positive affinity anywhere → neutral default (`meia` / 50).
 */
export function resolveOverall(
  affinity: Record<string, number>,
  careerOverall?: Partial<Record<Position, number>>,
): { primaryPos: Position; overall: number } {
  let best: { primaryPos: Position; overall: number; score: number } | null = null;
  for (const [pos, aff] of Object.entries(affinity)) {
    if (!(aff > 0)) continue;
    const effOverall = careerOverall?.[pos as Position] ?? clamp(aff, 0, 99);
    const score = (aff / 100) * effOverall;
    if (!best || score > best.score) {
      best = { primaryPos: pos as Position, overall: effOverall, score };
    }
  }
  return best
    ? { primaryPos: best.primaryPos, overall: best.overall }
    : { primaryPos: DEFAULT_PRIMARY_POS, overall: DEFAULT_OVERALL };
}

/**
 * The affinity map to rate a player by: their own global self-declared
 * `Player.affinity` when non-empty, else the group's `GroupMember.affinity`
 * (legacy/guest), else empty (→ neutral default).
 */
export function affinityFor(
  playerAffinity: Record<string, number> | undefined,
  memberAffinity: Record<string, number> | undefined,
): Record<string, number> {
  if (playerAffinity && Object.keys(playerAffinity).length > 0) return playerAffinity;
  return memberAffinity ?? {};
}
