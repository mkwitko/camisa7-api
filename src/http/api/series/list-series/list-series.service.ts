import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { SeriesRepository } from "../series.repository";
import type { MatchSeries } from "../series.types";

export type ListGroupSeriesDeps = { seriesRepo: SeriesRepository; groupsRepo: GroupsRepository };

/** Owner lists all series belonging to their own group. */
export function createListGroupSeriesService(deps: ListGroupSeriesDeps) {
  return async (groupId: string, userId: string): Promise<MatchSeries[]> => {
    const group = await deps.groupsRepo.findById(groupId);
    assertGroupOwner(group, userId);

    return deps.seriesRepo.listByGroup(groupId);
  };
}
