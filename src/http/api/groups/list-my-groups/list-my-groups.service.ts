import type { GroupsRepository } from "../groups.repository";
import type { Group } from "../groups.types";

export type ListMyGroupsDeps = { repo: GroupsRepository };

export function createListMyGroupsService(deps: ListMyGroupsDeps) {
  return async (ownerId: string): Promise<Group[]> => deps.repo.listOwnedBy(ownerId);
}
