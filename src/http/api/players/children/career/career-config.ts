/**
 * F1-4 growth-engine config — every weight, cap, and threshold the pure
 * engine (`career-engine.ts`) reads lives here, versioned, so tuning it
 * (e.g. after seeing real match data) never touches engine logic. Bump
 * `version` in the same commit as any value change — nothing currently
 * reads it, it's a marker for whoever's diffing "did the growth model
 * change" across deployments.
 *
 * §6 of the design doc ("Motor de crescimento") names the shape
 * (result/goals/assists/clean_sheet/votes → bounded per-match step,
 * MVP/craque boost overall, fair_play stays reputation-only) but leaves the
 * exact numbers to implementation — the rationale for each pick is inline
 * below.
 */
export const CAREER_CONFIG = {
  version: 1,

  /**
   * Max ± `overall` points ANY single position can move from ONE match —
   * the "no oscillation" guarantee the design doc asks for (§6: "passo
   * máximo limitado por jogo"). 3 points means it takes several strong
   * (or poor) performances in a row to meaningfully shift a position,
   * which is the intent: one freak hat-trick shouldn't overnight turn a
   * bronze player into prata.
   */
  perMatchStepCap: 3,

  /**
   * A position's `overall` moves toward a per-match "signal" (see
   * `computeSignal` in `career-engine.ts`), capped by `perMatchStepCap`.
   * Applied at full weight to the player's PRIMARY position for that
   * match's group; secondary positions move toward the same signal but at
   * this reduced factor (still capped independently) — reflects that the
   * performance more directly proves out their primary position.
   */
  secondaryPositionFactor: 0.5,

  /**
   * Starting `overall` for a position the FIRST time the replay touches it
   * (bootstrap, §6: "jogador novo sem histórico usa seed_overall"). Only
   * used when that match's `GroupMember.seedOverall` has no entry for the
   * position either (an organizer who never rated the player) — otherwise
   * the organizer's own seed wins. 50 is the deliberately neutral
   * "unrated rookie" midpoint on the 0-99 scale.
   */
  bootstrapDefaultOverall: 50,

  /**
   * Per-match-performance weights feeding the signal a position's
   * `overall` moves toward (see `computeSignal`). Everything here is in
   * "overall points" units, pre-cap — the `perMatchStepCap` clamp is what
   * actually bounds the swing, these just set the RELATIVE importance of
   * each input relative to each other.
   */
  weights: {
    // Result carries the most weight — team success is the single
    // strongest per-game signal available in Fase 1 (no per-touch data).
    win: 6,
    draw: 1,
    loss: -6,
    // Attacking output, in points-per-unit — a hat-trick (3 goals) alone
    // would already hit the step cap on its own.
    goal: 3,
    assist: 2,
    // Own goals penalize harder than a goal rewards — same "costly mistake
    // outweighs a routine contribution" asymmetry as `loss` vs `win`.
    ownGoal: -4,
    // Goalkeeper-only bonus (gated by position === "goleiro" in
    // `computeSignal`) — a clean sheet is the GK-equivalent of a goal.
    cleanSheet: 5,
    // Votes: "MVP/craque weigh most" per §6 — mvp slightly above craque
    // since it's the single "best of the match" recognition, craque a
    // close second ("standout"). melhor_goleiro is GK-gated like
    // cleanSheet, weighted like craque. fair_play deliberately has NO
    // entry here — §6 is explicit it feeds reputation, not the technical
    // overall, and `PlayerCareer` (per the F1-4 schema) has no separate
    // reputation counter yet, so a fair_play vote simply doesn't affect
    // this engine at all.
    mvpVote: 4,
    craqueVote: 3,
    melhorGoleiroVote: 3,
  },

  /**
   * `level` bands over the player's BEST per-position `overall` (their
   * strongest position defines their level — a specialist's overall in
   * positions they've never played shouldn't drag their level down).
   * `>= ouro` and `>= prata` — anything below `prata` is `bronze`
   * (`PlayerLevel`'s `@default(bronze)`, and the natural floor for a
   * brand-new bootstrap-only career).
   */
  levelThresholds: {
    prata: 70,
    ouro: 85,
  },
} as const;
