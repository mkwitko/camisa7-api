import type { MatchResultResponse } from "./result.schema";
import type { MatchResult } from "./result.types";

/** Flattens a domain `MatchResult` into the API response shape. */
export function presentMatchResult(result: MatchResult): MatchResultResponse {
  return {
    matchId: result.matchId,
    scores: result.scores.map((s) => ({ team: s.team, goals: s.goals })),
    winnerTeam: result.winnerTeam,
    recordedById: result.recordedById,
    recordedAt: result.recordedAt,
  };
}
