import type { PrismaClient } from "@/generated/prisma/client";
import type { MembersRepository } from "../children/members/members.repository";
import { createGroupsRepository } from "../groups.repository";
import type { Group } from "../groups.types";
import type { CreateGroupBody } from "./create-group.schema";

export type CreateGroupDeps = { prisma: PrismaClient; membersRepo: MembersRepository };

export type CreateGroupInput = CreateGroupBody & { ownerId: string };

/**
 * Creates the `Group` row AND auto-adds the owner as an `organizador`
 * member (Task 5: `GroupMember` + owner `Player`, linked to the `User`) —
 * both in ONE `prisma.$transaction` so a crash between the two never leaves
 * a group with no organizador. `createGroupsRepository(tx)` is built fresh
 * inside the transaction (its `insert` has no per-call `tx` override);
 * `deps.membersRepo` is the request-scoped instance, and `addForUser`'s
 * explicit `tx` param routes ITS writes through the same transaction (see
 * `members.repository.ts`).
 */
export function createCreateGroupService(deps: CreateGroupDeps) {
  return async (input: CreateGroupInput): Promise<Group> => {
    return deps.prisma.$transaction(async (tx) => {
      const group = await createGroupsRepository(tx).insert({
        name: input.name,
        statsMode: input.statsMode ?? "organizador",
        ownerId: input.ownerId,
      });
      await deps.membersRepo.addForUser(group.id, input.ownerId, "organizador", tx);
      return group;
    });
  };
}
