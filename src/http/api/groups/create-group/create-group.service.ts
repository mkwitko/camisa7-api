import type { GroupsRepository } from "../groups.repository";
import type { Group } from "../groups.types";
import type { CreateGroupBody } from "./create-group.schema";

export type CreateGroupDeps = { repo: GroupsRepository };

export type CreateGroupInput = CreateGroupBody & { ownerId: string };

/**
 * Only creates the `Group` row. Auto-adding the owner as an `organizador`
 * member is deferred to Task 5 — `GroupMember`/`Player` don't exist yet.
 */
export function createCreateGroupService(deps: CreateGroupDeps) {
  return async (input: CreateGroupInput): Promise<Group> => {
    return deps.repo.insert({
      name: input.name,
      statsMode: input.statsMode ?? "organizador",
      ownerId: input.ownerId,
    });
  };
}
