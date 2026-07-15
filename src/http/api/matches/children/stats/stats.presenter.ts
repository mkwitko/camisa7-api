import type { MatchStatResponse } from "./stats.schema";
import type { MatchStat } from "./stats.types";

/** Flattens a domain `MatchStat` into the API response shape. */
export function presentMatchStat(stat: MatchStat): MatchStatResponse {
  return {
    id: stat.id,
    matchId: stat.matchId,
    playerId: stat.playerId,
    team: stat.team,
    goals: stat.goals,
    assists: stat.assists,
    ownGoals: stat.ownGoals,
    cleanSheet: stat.cleanSheet,
    source: stat.source,
    createdAt: stat.createdAt,
    updatedAt: stat.updatedAt,
  };
}
