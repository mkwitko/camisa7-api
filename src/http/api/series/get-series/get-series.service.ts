import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertSeriesOwner } from "../series.authz";
import type { SeriesRepository } from "../series.repository";
import type { MatchSeries } from "../series.types";

export type GetSeriesDeps = { seriesRepo: SeriesRepository; groupsRepo: GroupsRepository };

/**
 * By-id fetch of a single series, scoped to the caller owning its parent
 * group. See `series.authz.ts` for why a 403 (not 404) is fine here for a
 * non-owner — unlike the top-level `GET /groups/:id`.
 */
export function createGetSeriesService(deps: GetSeriesDeps) {
  return async (seriesId: string, userId: string): Promise<MatchSeries> => {
    const series = await deps.seriesRepo.findById(seriesId);
    const group = series ? await deps.groupsRepo.findById(series.groupId) : null;
    const { series: asserted } = assertSeriesOwner(series, group, userId);
    return asserted;
  };
}
