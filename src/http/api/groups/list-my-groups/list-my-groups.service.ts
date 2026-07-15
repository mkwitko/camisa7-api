import type { GroupsRepository } from "../groups.repository";
import type { GroupWithMeta } from "../groups.types";

export type ListMyGroupsDeps = { repo: GroupsRepository };

export function createListMyGroupsService(deps: ListMyGroupsDeps) {
  return async (ownerId: string): Promise<GroupWithMeta[]> =>
    deps.repo.listOwnedByWithMeta(ownerId);
}
