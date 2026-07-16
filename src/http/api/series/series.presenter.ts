import type { SeriesResponse } from "./series.schema";
import type { MatchSeries } from "./series.types";

/** Maps a domain `MatchSeries` to the API response shape (currently a 1:1 flattening). */
export function presentSeries(series: MatchSeries): SeriesResponse {
  return {
    id: series.id,
    groupId: series.groupId,
    rule: series.rule,
    time: series.time,
    location: series.location,
    priceCents: series.priceCents,
    slots: series.slots,
    pixKey: series.pixKey,
    status: series.status,
    startDate: series.startDate,
    endDate: series.endDate,
    createdAt: series.createdAt,
  };
}
