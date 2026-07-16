import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { SeriesRepository } from "../series.repository";
import type { MatchSeries } from "../series.types";
import type { CreateSeriesBody } from "./create-series.schema";

export type CreateSeriesDeps = { seriesRepo: SeriesRepository; groupsRepo: GroupsRepository };

export type CreateSeriesInput = CreateSeriesBody & { groupId: string; userId: string };

/**
 * Owner creates a `MatchSeries` inside their own group. Always starts
 * `active` (repository default). Does not materialize any `Match` rows
 * inline — the recurrence job (Task 8) top-up pass covers new series within
 * its own poll interval (≤15min), by design (see task-6 plan).
 */
export function createCreateSeriesService(deps: CreateSeriesDeps) {
  return async (input: CreateSeriesInput): Promise<MatchSeries> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    return deps.seriesRepo.insert({
      groupId: input.groupId,
      rule: input.rule,
      time: input.time,
      location: input.location,
      priceCents: input.priceCents ?? 0,
      slots: input.slots,
      pixKey: input.pixKey ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    });
  };
}
