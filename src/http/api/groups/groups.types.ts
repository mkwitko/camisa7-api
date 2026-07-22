/**
 * Domain `Group` — not the Prisma row. `statsMode` mirrors the Prisma
 * `GroupStatsMode` enum values (`organizador`/`colaborativo`) as a plain
 * string union so this module (and its callers in Tasks 5,6,8,9,10,11)
 * doesn't depend on the generated Prisma client's types.
 */
export type GroupStatsMode = "organizador" | "colaborativo";

/**
 * Domain `JoinPolicy` — mirrors the Prisma `JoinPolicy` enum values as a plain
 * string union (same rationale as `GroupStatsMode`). Governs how strangers join
 * a PUBLIC group's matches: `open` = confirm directly, `request` = organizer
 * approves. Only meaningful while `isPublic` is true.
 */
export type JoinPolicy = "open" | "request";

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  statsMode: GroupStatsMode;
  /**
   * Geo G3: a public group's upcoming `open` matches surface in
   * `GET /discover`. Setting `true` requires the `public_groups` entitlement
   * (gated in `update-group.service`).
   */
  isPublic: boolean;
  /** How strangers join this group's public matches (only takes effect while `isPublic`). */
  joinPolicy: JoinPolicy;
  /**
   * Task 1 (Mensalista vs Avulso): default monthly fee for `mensalista`
   * members of this group, in cents. `null` means the group hasn't set one
   * yet — a `GroupMember` can override it via
   * `GroupMember.monthlyFeeCentsOverride`.
   */
  monthlyFeeCents: number | null;
  /**
   * Task 4 (Woovi onboarding): the organizer's PIX key registered as a Woovi
   * subaccount for this group (`POST /groups/:id/woovi/subaccount`). `null`
   * until the organizer completes onboarding.
   */
  wooviPixKey: string | null;
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
