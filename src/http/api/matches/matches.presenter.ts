import type { MatchResponse } from "./matches.schema";
import type { Match } from "./matches.types";

/** Maps a domain `Match` to the API response shape (currently a 1:1 flattening). */
export function presentMatch(match: Match): MatchResponse {
  return {
    id: match.id,
    groupId: match.groupId,
    datetime: match.datetime,
    location: match.location,
    priceCents: match.priceCents,
    slots: match.slots,
    pixKey: match.pixKey,
    status: match.status,
    recurrenceRule: match.recurrenceRule,
    createdAt: match.createdAt,
  };
}
