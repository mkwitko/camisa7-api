import type { GroupMember, Position } from "@/http/api/groups/children/members/members.types";

/**
 * A confirmed attendee with no `GroupMember` row in this group (e.g. a guest
 * who joined via the public invite flow, Task 9) gets a neutral default
 * rating — shared by `generate-teams` (building `BalancerPlayer`s) and
 * `update-teams` (recomputing `overallTotal` on a manual override) so both
 * land on the same effective overall for the same player.
 */
export const DEFAULT_PRIMARY_POS: Position = "meia";
export const DEFAULT_OVERALL = 50;

/**
 * Effective rating for one confirmed attendee: `member`'s
 * `seedOverall[primaryPos] ?? DEFAULT_OVERALL`, or the full default pair if
 * `member` is `undefined` (no `GroupMember` row for this player in the
 * match's group).
 */
export function resolveOverall(member: GroupMember | undefined): {
  primaryPos: Position;
  overall: number;
} {
  const primaryPos = member?.primaryPos ?? DEFAULT_PRIMARY_POS;
  const overall = member?.seedOverall[primaryPos] ?? DEFAULT_OVERALL;
  return { primaryPos, overall };
}
