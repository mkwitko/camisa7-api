/**
 * One team's roster in a `TeamAssignment` — `players` carries just enough to
 * render a roster (plus the `overall` used to build it) without a second
 * lookup. `overallTotal` is the same sum the balancer computes per team
 * (`BalanceResult.overallByTeam`) — persisted alongside the roster so a
 * guest player (no `GroupMember` row, `overall` defaulted to 50) still
 * contributes to the total the app displays instead of silently reading 0.
 */
export type TeamPlayer = { playerId: string; name: string; overall: number };

export type TeamSplit = {
  team: number;
  overallTotal: number;
  players: TeamPlayer[];
};

/**
 * Domain `TeamAssignment` — not the Prisma row. The last-generated (or
 * owner-overridden) team split for a `Match`; one per match (`save` is an
 * upsert keyed by `matchId`, see `teams.repository.ts`). `generatedAt` is
 * the Prisma row's `updatedAt` (every `save` bumps it, whether from a fresh
 * `balanceTeams()` run or a manual `update-teams` override).
 */
export type TeamAssignment = {
  matchId: string;
  teams: TeamSplit[];
  generatedAt: string;
};
