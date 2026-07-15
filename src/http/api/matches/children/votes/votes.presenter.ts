import type { CategoryTallyResponse, VoteResponse } from "./votes.schema";
import type { CategoryTally, Vote } from "./votes.types";

/** Flattens a domain `Vote` into the API response shape. */
export function presentVote(vote: Vote): VoteResponse {
  return {
    id: vote.id,
    matchId: vote.matchId,
    voterPlayerId: vote.voterPlayerId,
    category: vote.category,
    votedPlayerId: vote.votedPlayerId,
    createdAt: vote.createdAt,
    updatedAt: vote.updatedAt,
  };
}

/** Flattens a domain `CategoryTally` into the API response shape. */
export function presentCategoryTally(tally: CategoryTally): CategoryTallyResponse {
  return {
    category: tally.category,
    tally: tally.tally.map((entry) => ({ playerId: entry.playerId, votes: entry.votes })),
    leaderPlayerId: tally.leaderPlayerId,
  };
}
