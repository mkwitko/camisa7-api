import type { PrismaLike } from "@/infra/db/client";
import {
  type CategoryTally,
  type CategoryTallyEntry,
  VOTE_CATEGORIES,
  type Vote,
} from "./votes.types";

type VoteRow = {
  id: string;
  matchId: string;
  voterPlayerId: string;
  category: string;
  votedPlayerId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDomainVote(row: VoteRow): Vote {
  return {
    id: row.id,
    matchId: row.matchId,
    voterPlayerId: row.voterPlayerId,
    category: row.category as Vote["category"],
    votedPlayerId: row.votedPlayerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Sorts by `votes` desc, ties broken by `playerId` asc — deterministic output for `tallyByMatch`. */
function sortTally(entries: CategoryTallyEntry[]): CategoryTallyEntry[] {
  return [...entries].sort((a, b) => b.votes - a.votes || a.playerId.localeCompare(b.playerId));
}

/** The single top candidate, or `null` if there are no votes or the top spot is tied. */
function deriveLeader(sorted: CategoryTallyEntry[]): string | null {
  const top = sorted[0];
  if (!top) return null;
  const runnerUp = sorted[1];
  if (runnerUp && runnerUp.votes === top.votes) return null;
  return top.playerId;
}

export interface VotesRepository {
  /**
   * Upsert keyed by `(matchId, voterPlayerId, category)` — casting a vote
   * again for the same category on the same match corrects the same row
   * (lets a voter change their mind within the 48h window) rather than
   * accumulating history.
   */
  upsert(
    matchId: string,
    voterPlayerId: string,
    category: Vote["category"],
    votedPlayerId: string,
  ): Promise<Vote>;
  /**
   * Aggregated counts per category → per candidate, plus the per-category
   * leader — the shape `list-vote-tally` returns. Always includes all 4
   * `VoteCategory` values (in `VOTE_CATEGORIES` order), even ones with zero
   * votes cast so far, so API consumers don't need to special-case a missing
   * category. Never exposes `voterPlayerId` — individual votes stay private.
   */
  tallyByMatch(matchId: string): Promise<CategoryTally[]>;
  /** All raw vote rows for a match — internal only (feeds the F1-4 career-growth engine's MVP/craque counts), never exposed over the API. */
  listByMatch(matchId: string): Promise<Vote[]>;
}

/** Factory `createVotesRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createVotesRepository(db: PrismaLike): VotesRepository {
  return {
    async upsert(matchId, voterPlayerId, category, votedPlayerId) {
      const row = await db.vote.upsert({
        where: { matchId_voterPlayerId_category: { matchId, voterPlayerId, category } },
        create: { matchId, voterPlayerId, category, votedPlayerId },
        update: { votedPlayerId },
      });
      return toDomainVote(row);
    },

    async tallyByMatch(matchId) {
      const grouped = await db.vote.groupBy({
        by: ["category", "votedPlayerId"],
        where: { matchId },
        _count: { _all: true },
      });

      const byCategory = new Map<string, CategoryTallyEntry[]>();
      for (const row of grouped) {
        const entries = byCategory.get(row.category) ?? [];
        entries.push({ playerId: row.votedPlayerId, votes: row._count._all });
        byCategory.set(row.category, entries);
      }

      return VOTE_CATEGORIES.map((category) => {
        const sorted = sortTally(byCategory.get(category) ?? []);
        return { category, tally: sorted, leaderPlayerId: deriveLeader(sorted) };
      });
    },

    async listByMatch(matchId) {
      const rows = await db.vote.findMany({
        where: { matchId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toDomainVote);
    },
  };
}
