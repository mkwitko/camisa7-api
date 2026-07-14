import type { Player } from "@/http/api/players/players.types";

/**
 * On-field position — mirrors the Prisma `Position` enum values as a plain
 * string union so this module doesn't depend on the generated Prisma
 * client's types (same rationale as `GroupStatsMode` in `groups.types.ts`).
 * `secondaryPos` and the `affinity`/`seedOverall` JSON key sets are all
 * constrained to this same set (validated via Zod at the HTTP boundary) —
 * the balancer (Task 10) consumes it.
 */
export type Position = "goleiro" | "zagueiro" | "lateral" | "volante" | "meia" | "atacante";

export const POSITIONS: readonly Position[] = [
  "goleiro",
  "zagueiro",
  "lateral",
  "volante",
  "meia",
  "atacante",
];

/** A member's role inside one specific group (not a global role). */
export type MemberRole = "organizador" | "jogador";

/** Domain `GroupMember` — the child resource of `Group`, flattened with its `Player`. */
export type GroupMember = {
  id: string;
  groupId: string;
  player: Player;
  role: MemberRole;
  primaryPos: Position;
  secondaryPos: Position[];
  affinity: Record<string, number>;
  seedOverall: Record<string, number>;
};
