// Attribute-growth model: finalized matches grow player ATTRIBUTES across categories, never a separate overall.
export const CAREER_CONFIG = {
  version: 3,

  /**
   * Attribute-growth model (Task: single overall). A finalized match grows a
   * player's ATTRIBUTES (never a separate overall). All values are in
   * attribute points, applied at the CATEGORY level then spread evenly across
   * that category's sub-attributes; `perMatchStepCap` bounds the total
   * per-match movement so no single game spikes a player.
   */
  growth: {
    // Just playing: steady growth spread across the match's position profile.
    appearanceGrowth: 0.8,
    // Team success — general bump across the profile (draw/loss give nothing;
    // net-growth model never subtracts below base).
    winGrowth: 0.6,
    // Attacking output → its natural category.
    goalGrowth: 0.5, // → finalizacao
    assistGrowth: 0.4, // → passe
    // Clean sheet → goleiro (gk profile) else defesa.
    cleanSheetGrowth: 0.8,
    // Recognition votes → general growth across the profile.
    mvpGrowth: 0.7,
    craqueGrowth: 0.5,
    // GK-specific recognition → goleiro.
    melhorGoleiroGrowth: 0.6,
    // Own goals reduce EARNED defesa (floored at base, never below).
    ownGoalPenalty: 0.5,
    // Max total attribute points any single match can move (both directions).
    perMatchStepCap: 2.0,
  },

  /**
   * `level` bands over the player's best evolved position overall
   * (`generalOverallFrom`). bronze is the floor for a brand-new career.
   */
  levelThresholds: {
    prata: 70,
    ouro: 85,
  },
} as const;
