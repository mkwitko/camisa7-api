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
  /**
   * Task 1 (Mensalista vs Avulso): default monthly fee for `mensalista`
   * members of this group, in cents. `null` means the group hasn't set one
   * yet — a `GroupMember` can override it via
   * `GroupMember.monthlyFeeCentsOverride`.
   */
  monthlyFeeCents: number | null;
  createdAt: string;
};

/** The soonest still-upcoming match for a group — `null` if there isn't one. */
export type GroupNextMatch = {
  id: string;
  datetime: string;
  location: string;
};

/**
 * `Group` enriched with summary fields `list-my-groups` needs so the app can
 * render a group card without a follow-up request per group: `memberCount`
 * (total `GroupMember` rows) and `nextMatch` (the soonest future `open`/
 * `full` match, or `null`).
 */
export type GroupWithMeta = Group & {
  memberCount: number;
  nextMatch: GroupNextMatch | null;
};
