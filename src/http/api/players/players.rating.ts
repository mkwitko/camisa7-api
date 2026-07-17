import type { FieldPosition } from "@/http/api/groups/children/members/members.types";
import {
  type AttributeCategory,
  ATTRIBUTE_BASELINE,
  ATTRIBUTE_CATEGORIES,
  CATEGORY_SUBS,
  POSITION_WEIGHTS,
} from "./players.catalog";

function round(n: number): number {
  return Math.round(n);
}

/** Overall (0-99) of one category = mean of its sub-attributes (baseline-filled). */
export function categoryOverall(attrs: Record<string, number>, category: AttributeCategory): number {
  const subs = CATEGORY_SUBS[category];
  const sum = subs.reduce((acc, key) => acc + (attrs[key] ?? ATTRIBUTE_BASELINE), 0);
  return round(sum / subs.length);
}

/** All 7 category overalls as a map. */
export function categoryOveralls(
  attrs: Record<string, number>,
): Record<AttributeCategory, number> {
  const out = {} as Record<AttributeCategory, number>;
  for (const c of ATTRIBUTE_CATEGORIES) out[c] = categoryOverall(attrs, c);
  return out;
}

/**
 * Overall (0-99) of one position = weighted mean of the category overalls,
 * using that position's weight vector (`POSITION_WEIGHTS`).
 */
export function positionOverall(attrs: Record<string, number>, position: FieldPosition): number {
  const weights = POSITION_WEIGHTS[position];
  let weighted = 0;
  let total = 0;
  for (const c of ATTRIBUTE_CATEGORIES) {
    const w = weights[c];
    if (w <= 0) continue;
    weighted += categoryOverall(attrs, c) * w;
    total += w;
  }
  return total > 0 ? round(weighted / total) : 0;
}

/**
 * General overall = the highest `positionOverall` across the positions the
 * player declared (keys of `affinity`). `0` when none declared.
 */
export function generalOverall(
  attrs: Record<string, number>,
  declaredPositions: readonly string[],
): number {
  let best = 0;
  for (const pos of declaredPositions) {
    if (!(pos in POSITION_WEIGHTS)) continue;
    best = Math.max(best, positionOverall(attrs, pos as FieldPosition));
  }
  return best;
}

/**
 * The base overall (0-99) a position starts at before match stats: the
 * attribute-derived `positionOverall` modulated by the player's declared
 * affinity — Natural (100) keeps 100%, Fraco (25) ≈ 62%. This replaces the
 * raw affinity bootstrap in the career engine / balancer.
 */
export function effectiveBase(
  attrs: Record<string, number>,
  position: FieldPosition,
  affinity: number,
): number {
  const factor = 0.5 + 0.5 * (Math.max(0, Math.min(100, affinity)) / 100);
  return Math.min(99, round(positionOverall(attrs, position) * factor));
}
