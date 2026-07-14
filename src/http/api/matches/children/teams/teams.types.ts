/** One team's roster in a `TeamAssignment` — `players` carries just enough to render a roster without a second lookup. */
export type TeamSplit = {
  team: number;
  players: { playerId: string; name: string }[];
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
