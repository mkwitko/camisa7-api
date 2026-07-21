import type { PrismaLike } from "@/infra/db/client";
import {
  type ReputationCounts,
  type ReputationDimension,
  type VoterTag,
  zeroCounts,
} from "./reputation.types";

export interface ReputationRepository {
  /** Replace ALL of this voter's tags for the match with `tags` (delete-then-insert in a tx). */
  replaceForVoter(matchId: string, voterPlayerId: string, tags: VoterTag[]): Promise<void>;
  /** This voter's current tags on the match, grouped per voted player. */
  listByVoter(matchId: string, voterPlayerId: string): Promise<VoterTag[]>;
  /** Count of tags this player RECEIVED, per dimension (all-time). */
  countsByPlayer(playerId: string): Promise<ReputationCounts>;
}

/** Factory `createReputationRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createReputationRepository(db: PrismaLike): ReputationRepository {
  return {
    async replaceForVoter(matchId, voterPlayerId, tags) {
      const rows = tags.flatMap((t) =>
        t.dimensions.map((dimension) => ({
          matchId,
          voterPlayerId,
          votedPlayerId: t.votedPlayerId,
          dimension,
        })),
      );
      // Atomic replace: delete + create inside a single `$transaction`.
      // `Prisma.TransactionClient` does support `$transaction` (it's not in
      // `ITXClientDenyList`), so this composes whether `db` is the top-level
      // client or already a `tx` from an outer transaction (see
      // `court.repository.ts`'s `replacePriceRules` for the same pattern).
      await db.$transaction([
        db.reputationTag.deleteMany({ where: { matchId, voterPlayerId } }),
        ...(rows.length > 0 ? [db.reputationTag.createMany({ data: rows })] : []),
      ]);
    },

    async listByVoter(matchId, voterPlayerId) {
      const rows = await db.reputationTag.findMany({
        where: { matchId, voterPlayerId },
        select: { votedPlayerId: true, dimension: true },
      });
      const byVoted = new Map<string, ReputationDimension[]>();
      for (const r of rows) {
        const list = byVoted.get(r.votedPlayerId) ?? [];
        list.push(r.dimension);
        byVoted.set(r.votedPlayerId, list);
      }
      return [...byVoted.entries()].map(([votedPlayerId, dimensions]) => ({
        votedPlayerId,
        dimensions,
      }));
    },

    async countsByPlayer(playerId) {
      const grouped = await db.reputationTag.groupBy({
        by: ["dimension"],
        where: { votedPlayerId: playerId },
        _count: { _all: true },
      });
      const counts = zeroCounts();
      for (const g of grouped) counts[g.dimension] = g._count._all;
      return counts;
    },
  };
}
