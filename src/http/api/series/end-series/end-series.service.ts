import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertSeriesOwner } from "../series.authz";
import type { SeriesRepository } from "../series.repository";
import type { MatchSeries } from "../series.types";

export type EndSeriesDeps = { seriesRepo: SeriesRepository; groupsRepo: GroupsRepository };

/**
 * Owner ends a `MatchSeries` — sets `status: "ended"` (terminal, spec §3.4).
 * Deliberately does NOT cancel any already-spawned future occurrence: those
 * stay whatever status they were (`open`/`full`/etc) so a pelada already on
 * the calendar isn't yanked out from under attendees just because the
 * organizer stopped future generation. `listActive`/the recurrence job's
 * top-up pass simply stop picking this series up once `status !== "active"`.
 */
export function createEndSeriesService(deps: EndSeriesDeps) {
  return async (seriesId: string, userId: string): Promise<MatchSeries> => {
    const series = await deps.seriesRepo.findById(seriesId);
    const group = series ? await deps.groupsRepo.findById(series.groupId) : null;
    assertSeriesOwner(series, group, userId);

    return deps.seriesRepo.update(seriesId, { status: "ended" });
  };
}
