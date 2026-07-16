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
 *
 * Task 2 (FM rating model): replaced the old primary/secondary-position
 * split + group `seedOverall` bootstrap with an affinity-weighted model —
 * see `career-engine.ts`'s doc comment. `secondaryPositionFactor` and
 * `bootstrapDefaultOverall` are gone: every position `computeCareer` ever
 * touches carries its own positive `affinity` value (the gate for touching
 * it at all), so there's no longer a "secondary" role or an "unrated"
 * default to fall back to.
 */
export const CAREER_CONFIG = {
  version: 2,

  /**
   * Max ± `overall` points ANY single position can move from ONE match —
   * the "no oscillation" guarantee the design doc asks for (§6: "passo
   * máximo limitado por jogo"). 3 points means it takes several strong
   * (or poor) performances in a row to meaningfully shift a position,
   * which is the intent: one freak hat-trick shouldn't overnight turn a
   * bronze player into prata. Applied AFTER the affinity scaling (see
   * `computeCareer`), so a high-affinity position can still ride the cap on
   * a big performance while a low-affinity one moves proportionally less.
   */
  perMatchStepCap: 3,

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
