import type { GroupStatsMode } from "@/http/api/groups/groups.types";
import type { PrismaLike } from "@/infra/db/client";

let userSeq = 0;

/**
 * Creates a throwaway `User` row to satisfy `Group.ownerId`'s FK in tests —
 * `Group` doesn't exist without a real owner, unlike `auth.repository.test.ts`
 * which inserts `User` rows directly since that IS the aggregate under test.
 */
export async function createOwner(
  db: PrismaLike,
  overrides: Partial<{ email: string; name: string }> = {},
): Promise<string> {
  userSeq += 1;
  const user = await db.user.create({
    data: {
      email: overrides.email ?? `owner-${userSeq}@test.com`,
      name: overrides.name ?? `Owner ${userSeq}`,
    },
  });
  return user.id;
}

/** Builds a `GroupsRepository.insert` input; defaults `statsMode` to `organizador`. */
export function buildGroupInput(
  ownerId: string,
  overrides: Partial<{ name: string; statsMode: GroupStatsMode }> = {},
): { name: string; statsMode: GroupStatsMode; ownerId: string } {
  return {
    name: overrides.name ?? "Test Group",
    statsMode: overrides.statsMode ?? "organizador",
    ownerId,
  };
}
