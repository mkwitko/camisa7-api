/**
 * Input to the balancer — one confirmed attendee's rating snapshot. Built by
 * `generate-teams` from the player's affinity × career overall (falling back
 * to `overall: 50`/`primaryPos: "campo_meia"` for a guest with no rating —
 * see `generate-teams.service.ts`). `primaryPos` is a modality-scoped
 * `FieldPosition` slug (kept as `string` here so this module stays free of the
 * position vocabulary). Kept structurally independent of
 * `GroupMember`/`Attendance` so this module has zero DB/Prisma dependency,
 * which is what keeps it pure and trivially unit-testable.
 */
export type BalancerPlayer = {
  playerId: string;
  name: string;
  primaryPos: string;
  overall: number;
  isGoalkeeper: boolean;
};

export type BalanceResult = {
  teams: { team: number; playerIds: string[] }[];
  overallByTeam: number[];
};

/**
 * Stable total order: `overall` descending, `playerId` ascending as the
 * tie-breaker. This is what makes every downstream step deterministic — the
 * comparator already fully orders any two distinct players (no two players
 * share a `playerId`), so determinism holds regardless of the input array's
 * original order or the sort implementation's stability.
 */
function compareForSort(a: BalancerPlayer, b: BalancerPlayer): number {
  if (a.overall !== b.overall) return b.overall - a.overall;
  if (a.playerId < b.playerId) return -1;
  if (a.playerId > b.playerId) return 1;
  return 0;
}

/**
 * Fair-share team sizes for `total` players across `teamCount` teams: the
 * first `total % teamCount` teams (lowest index) get one extra player, the
 * rest get `floor(total / teamCount)`. Both the goalkeeper round-robin (step
 * 1) and the outfield greedy assignment (step 2) respect this as a hard cap
 * — goalkeeper round-robin can never push a team past its share here because
 * the round-robin quota for any sub-count of players (e.g. just the
 * goalkeepers) is provably <= the fair-share quota for the full player count
 * at every team index (adding more players to the pool never lowers a
 * team's fair-share quota under this same first-N-teams-get-the-remainder
 * convention).
 */
function targetSizes(total: number, teamCount: number): number[] {
  const base = Math.floor(total / teamCount);
  const extra = total % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Mutable per-team working state — a single object per team avoids ever needing a computed-index read into a parallel array (this repo builds with `noUncheckedIndexedAccess`). */
type TeamState = {
  team: number;
  playerIds: string[];
  overall: number;
  count: number;
};

/**
 * Safety cap on the swap-optimization loop (step 3). Each accepted swap
 * strictly decreases an integer `max - min` diff that's bounded by the
 * input's own overall range, so convergence in practice takes only a
 * handful of iterations — this cap only exists to guarantee termination
 * even in a pathological input, it is not expected to ever bind.
 */
const MAX_SWAP_ITERATIONS = 200;

/**
 * Builds `teamCount` balanced teams from `players`. Pure and deterministic —
 * no `Math.random()`, no `Date.now()`, no reliance on input order (players
 * are re-sorted by value) — the same `players` + `teamCount` always produces
 * the exact same `{ teams, overallByTeam }`.
 *
 * 1. Goalkeepers sorted by `overall` desc (tie: `playerId` asc), round-robin
 *    assigned across teams 0..teamCount-1 — spreads them evenly regardless
 *    of the outfield assignment that follows.
 * 2. Outfield players sorted the same way; each is assigned to the
 *    currently-lowest-`overallByTeam` team among the teams that haven't yet
 *    reached their fair-share size (`targetSizes`) — tie: lowest team index.
 * 3. Bounded local search: repeatedly looks for the single cross-team,
 *    same-kind (goalkeeper<->goalkeeper or outfield<->outfield — a mixed
 *    swap would silently undo the goalkeeper spread from step 1) player swap
 *    that most reduces `max(overallByTeam) - min(overallByTeam)`; applies it
 *    if one exists, stops as soon as none does (or after
 *    `MAX_SWAP_ITERATIONS`, a defensive bound — see its doc comment).
 */
export function balanceTeams(players: BalancerPlayer[], teamCount: number): BalanceResult {
  if (teamCount < 1) return { teams: [], overallByTeam: [] };

  const byId = new Map(players.map((p) => [p.playerId, p]));
  const goalkeepers = [...players].filter((p) => p.isGoalkeeper).sort(compareForSort);
  const outfield = [...players].filter((p) => !p.isGoalkeeper).sort(compareForSort);

  const teamStates: TeamState[] = Array.from({ length: teamCount }, (_, team) => ({
    team,
    playerIds: [],
    overall: 0,
    count: 0,
  }));

  for (const [idx, gk] of goalkeepers.entries()) {
    const state = teamStates.find((s) => s.team === idx % teamCount);
    if (!state) continue; // unreachable: `idx % teamCount` is always < teamStates.length
    state.playerIds.push(gk.playerId);
    state.overall += gk.overall;
    state.count += 1;
  }

  const targets = targetSizes(players.length, teamCount);

  for (const outfieldPlayer of outfield) {
    let bestState: TeamState | null = null;
    for (const state of teamStates) {
      const target = targets[state.team] ?? 0;
      if (state.count >= target) continue;
      if (!bestState || state.overall < bestState.overall) bestState = state;
    }
    if (!bestState) continue; // unreachable: `targets` sums to `players.length`
    bestState.playerIds.push(outfieldPlayer.playerId);
    bestState.overall += outfieldPlayer.overall;
    bestState.count += 1;
  }

  optimizeBySwapping(teamStates, byId);

  return {
    teams: teamStates.map((s) => ({ team: s.team, playerIds: s.playerIds })),
    overallByTeam: teamStates.map((s) => s.overall),
  };
}

/**
 * Step 3 — see `balanceTeams`'s doc comment. Mutates `teamStates` in place
 * (freshly built by `balanceTeams`, never the caller's own state, so this
 * doesn't violate purity from the outside).
 */
function optimizeBySwapping(teamStates: TeamState[], byId: Map<string, BalancerPlayer>): void {
  for (let iteration = 0; iteration < MAX_SWAP_ITERATIONS; iteration++) {
    const overalls = teamStates.map((s) => s.overall);
    const currentDiff = Math.max(...overalls) - Math.min(...overalls);

    let best: {
      stateI: TeamState;
      stateJ: TeamState;
      pi: number;
      pj: number;
      playerIdI: string;
      playerIdJ: string;
      diff: number;
    } | null = null;

    for (const stateI of teamStates) {
      for (const stateJ of teamStates) {
        if (stateJ.team <= stateI.team) continue;

        for (const [pi, playerIdI] of stateI.playerIds.entries()) {
          const a = byId.get(playerIdI);
          if (!a) continue;

          for (const [pj, playerIdJ] of stateJ.playerIds.entries()) {
            const b = byId.get(playerIdJ);
            if (!b) continue;
            if (a.isGoalkeeper !== b.isGoalkeeper) continue; // would break GK balance
            if (a.overall === b.overall) continue; // no-op, never improves

            const newI = stateI.overall - a.overall + b.overall;
            const newJ = stateJ.overall - b.overall + a.overall;
            const others = teamStates
              .filter((s) => s !== stateI && s !== stateJ)
              .map((s) => s.overall);
            const newMax = Math.max(newI, newJ, ...others);
            const newMin = Math.min(newI, newJ, ...others);
            const diff = newMax - newMin;

            if (diff < currentDiff && (!best || diff < best.diff)) {
              best = { stateI, stateJ, pi, pj, playerIdI, playerIdJ, diff };
            }
          }
        }
      }
    }

    if (!best) break;

    const { stateI, stateJ, pi, pj, playerIdI, playerIdJ } = best;
    const a = byId.get(playerIdI);
    const b = byId.get(playerIdJ);
    if (!a || !b) break; // unreachable: both were looked up successfully above

    stateI.playerIds[pi] = playerIdJ;
    stateJ.playerIds[pj] = playerIdI;
    stateI.overall = stateI.overall - a.overall + b.overall;
    stateJ.overall = stateJ.overall - b.overall + a.overall;
  }
}
