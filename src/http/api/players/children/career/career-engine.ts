import type { FieldPosition } from "@/http/api/groups/children/members/members.types";
import {
  ATTRIBUTE_CATEGORIES,
  type AttributeCategory,
  CATEGORY_SUBS,
  POSITION_WEIGHTS,
  withAttributeDefaults,
} from "@/http/api/players/players.catalog";
import { generalOverallFrom } from "@/http/api/players/players.rating";
import type { ComputedCareer, MatchPerformance, PlayerLevel } from "./career.types";
import { CAREER_CONFIG } from "./career-config";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Affinity-weighted, category-normalized position profile for ONE match's
 * declared affinity — Σ over the 7 categories = 1 (or all-zero when no
 * position is declared for this match). Appearance/result/vote growth is
 * spread across categories by this profile, so a player grows toward the
 * positions they actually declare.
 */
function positionProfile(
  affinity: Partial<Record<FieldPosition, number>>,
): Record<AttributeCategory, number> {
  const acc = {} as Record<AttributeCategory, number>;
  for (const c of ATTRIBUTE_CATEGORIES) acc[c] = 0;

  for (const [pos, aff] of Object.entries(affinity)) {
    if (!aff || aff <= 0) continue;
    if (!(pos in POSITION_WEIGHTS)) continue;
    const w = POSITION_WEIGHTS[pos as FieldPosition];
    for (const c of ATTRIBUTE_CATEGORIES) acc[c] += w[c] * aff;
  }

  let sum = 0;
  for (const c of ATTRIBUTE_CATEGORIES) sum += acc[c];
  if (sum > 0) for (const c of ATTRIBUTE_CATEGORIES) acc[c] /= sum;
  return acc;
}

/** `goleiro` when the match's profile is goalkeeper-dominant, else `defesa`. */
function keeperOrDefense(profile: Record<AttributeCategory, number>): AttributeCategory {
  let best: AttributeCategory = ATTRIBUTE_CATEGORIES[0];
  for (const c of ATTRIBUTE_CATEGORIES) if (profile[c] > profile[best]) best = c;
  return best === "goleiro" ? "goleiro" : "defesa";
}

function deriveLevel(
  attributes: Record<string, number>,
  affinity: Partial<Record<FieldPosition, number>>,
): PlayerLevel {
  const best = generalOverallFrom(attributes, affinity);
  if (best >= CAREER_CONFIG.levelThresholds.ouro) return "ouro";
  if (best >= CAREER_CONFIG.levelThresholds.prata) return "prata";
  return "bronze";
}

/**
 * The growth engine — PURE, DETERMINISTIC, IDEMPOTENT. Replays the player's
 * entire finalized-match history (unsorted; this function sorts by `datetime`,
 * ties by `matchId`) from their DECLARED base attributes and returns the
 * evolved attribute map plus career counters. Overall is never stored — it is
 * derived from `attributes` by the presenters (`generalOverallFrom`).
 *
 * Per match: appearance growth + result/vote general growth spread across the
 * match's `positionProfile`, plus stat-specific growth (goals→finalizacao,
 * assists→passe, clean sheet→goleiro/defesa, gk votes→goleiro), minus own-goal
 * penalty on earned defesa. Category deltas spread evenly across sub-attributes,
 * total movement capped by `perMatchStepCap`, earned deltas floored at 0 (never
 * below base). `evolved = clamp(round(base + earned), 0, 99)`.
 */
export function computeCareer(input: {
  baseAttributes?: Record<string, number> | undefined;
  affinity: Partial<Record<FieldPosition, number>>;
  performances: MatchPerformance[];
}): ComputedCareer {
  const { baseAttributes, affinity, performances } = input;
  const base = withAttributeDefaults(baseAttributes ?? {});
  const g = CAREER_CONFIG.growth;

  const sorted = [...performances].sort(
    (a, b) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime() ||
      a.matchId.localeCompare(b.matchId),
  );

  const earned: Record<string, number> = {};

  let wins = 0,
    draws = 0,
    losses = 0,
    goals = 0,
    assists = 0,
    cleanSheets = 0,
    mvpCount = 0,
    currentStreak = 0,
    bestStreak = 0;

  for (const perf of sorted) {
    const profile = positionProfile(perf.affinity);

    const catDelta = {} as Record<AttributeCategory, number>;
    for (const c of ATTRIBUTE_CATEGORIES) catDelta[c] = 0;

    // Appearance growth.
    for (const c of ATTRIBUTE_CATEGORIES) catDelta[c] += g.appearanceGrowth * profile[c];

    // Result (win only — net growth).
    if (perf.outcome === "win")
      for (const c of ATTRIBUTE_CATEGORIES) catDelta[c] += g.winGrowth * profile[c];

    // Recognition votes → general.
    const voteGeneral = perf.mvpVotes * g.mvpGrowth + perf.craqueVotes * g.craqueGrowth;
    if (voteGeneral > 0)
      for (const c of ATTRIBUTE_CATEGORIES) catDelta[c] += voteGeneral * profile[c];

    // Stat-specific.
    catDelta.finalizacao += perf.goals * g.goalGrowth;
    catDelta.passe += perf.assists * g.assistGrowth;
    const gkCat = keeperOrDefense(profile);
    if (perf.cleanSheet) catDelta[gkCat] += g.cleanSheetGrowth;
    catDelta.goleiro += perf.melhorGoleiroVotes * g.melhorGoleiroGrowth;
    catDelta.defesa -= perf.ownGoals * g.ownGoalPenalty;

    // Per-match cap on total category movement.
    let total = 0;
    for (const c of ATTRIBUTE_CATEGORIES) total += Math.abs(catDelta[c]);
    if (total > g.perMatchStepCap && total > 0) {
      const scale = g.perMatchStepCap / total;
      for (const c of ATTRIBUTE_CATEGORIES) catDelta[c] *= scale;
    }

    // Category deltas → per-sub adds. categoryOverall is the MEAN of its subs,
    // so adding the category delta to EACH sub raises that category's overall
    // by the full delta (dividing would dilute it to delta/subCount).
    const subAdd: Record<string, number> = {};
    for (const c of ATTRIBUTE_CATEGORIES) {
      for (const sub of CATEGORY_SUBS[c]) subAdd[sub] = (subAdd[sub] ?? 0) + catDelta[c];
    }

    // Accumulate, floor earned at 0 (never below base).
    for (const sub of Object.keys(subAdd))
      earned[sub] = Math.max(0, (earned[sub] ?? 0) + (subAdd[sub] ?? 0));

    if (perf.outcome === "win") wins += 1;
    else if (perf.outcome === "draw") draws += 1;
    else losses += 1;

    goals += perf.goals;
    assists += perf.assists;
    if (perf.cleanSheet) cleanSheets += 1;
    mvpCount += perf.mvpVotes;

    currentStreak = perf.outcome === "loss" ? 0 : currentStreak + 1;
    bestStreak = Math.max(bestStreak, currentStreak);
  }

  const attributes: Record<string, number> = {};
  for (const key of Object.keys(base)) {
    attributes[key] = clamp(Math.round((base[key] ?? 0) + (earned[key] ?? 0)), 0, 99);
  }

  return {
    attributes,
    affinity,
    level: deriveLevel(attributes, affinity),
    matchesPlayed: sorted.length,
    wins,
    draws,
    losses,
    goals,
    assists,
    cleanSheets,
    mvpCount,
    currentStreak,
    bestStreak,
  };
}
