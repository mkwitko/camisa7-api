/**
 * Domain `Group` — not the Prisma row. `statsMode` mirrors the Prisma
 * `GroupStatsMode` enum values (`organizador`/`colaborativo`) as a plain
 * string union so this module (and its callers in Tasks 5,6,8,9,10,11)
 * doesn't depend on the generated Prisma client's types.
 */
export type GroupStatsMode = "organizador" | "colaborativo";

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  statsMode: GroupStatsMode;
  createdAt: string;
};
