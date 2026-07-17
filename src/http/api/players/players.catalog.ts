/**
 * Onboarding profile catalogs (UX overhaul) — the fixed vocabulary for the
 * player's self-declared **attributes** (a redistributable point budget) and
 * **skills** (badge tags). Both are DESCRIPTIVE ONLY: they live on the profile
 * card and never feed the team balancer (which stays on affinity×overall).
 *
 * Kept as `const` string tuples so they drive both the Zod enums (validation)
 * and the OpenAPI/Kubb types the app consumes — single source of truth.
 */

/** The 10 attributes the player balances. Order = display order. */
export const ATTRIBUTE_KEYS = [
  "chute",
  "passe",
  "drible",
  "velocidade",
  "forca",
  "cabeceio",
  "marcacao",
  "desarme",
  "visao",
  "lideranca",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** Each attribute starts here; the player redistributes from a fixed budget. */
export const ATTRIBUTE_BASELINE = 50;
/** Fixed total the attribute map must always sum to (baseline × count). */
export const ATTRIBUTE_BUDGET = ATTRIBUTE_BASELINE * ATTRIBUTE_KEYS.length;

/** Skill catalog — the player picks up to `MAX_SKILLS`. */
export const SKILL_KEYS = [
  "driblador",
  "goleador",
  "garcom",
  "muralha",
  "motorzinho",
  "capitao",
  "maestro",
  "paredao",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export const MAX_SKILLS = 3;

/**
 * Fills the 50-baseline defaults for any attribute the player hasn't touched,
 * so responses always carry the full map even for a player whose stored
 * `attributes` is still `{}` (never onboarded).
 */
export function withAttributeDefaults(
  stored: Record<string, number>,
): Record<AttributeKey, number> {
  const full = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    full[key] = stored[key] ?? ATTRIBUTE_BASELINE;
  }
  return full;
}
