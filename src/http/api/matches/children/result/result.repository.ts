import type { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import type { MatchResult, TeamScore } from "./result.types";

type MatchResultRow = {
  id: string;
  matchId: string;
  scores: unknown;
  winnerTeam: number | null;
  recordedById: string;
  updatedAt: Date;
};

function toDomainMatchResult(row: MatchResultRow): MatchResult {
  return {
    id: row.id,
    matchId: row.matchId,
    scores: row.scores as TeamScore[],
    winnerTeam: row.winnerTeam,
    recordedById: row.recordedById,
    recordedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertMatchResultInput = {
  scores: TeamScore[];
  winnerTeam: number | null;
  recordedById: string;
};

export interface MatchResultRepository {
  /** Upsert keyed by `matchId` — recording a result twice corrects the same row rather than accumulating history. */
  upsert(matchId: string, input: UpsertMatchResultInput): Promise<MatchResult>;
  findByMatch(matchId: string): Promise<MatchResult | null>;
}

/** Factory `createMatchResultRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMatchResultRepository(db: PrismaLike): MatchResultRepository {
  return {
    async upsert(matchId, input) {
      const scores = input.scores as unknown as Prisma.InputJsonValue;
      const row = await db.matchResult.upsert({
        where: { matchId },
        create: {
          matchId,
          scores,
          winnerTeam: input.winnerTeam,
          recordedById: input.recordedById,
        },
        update: {
          scores,
          winnerTeam: input.winnerTeam,
          recordedById: input.recordedById,
        },
      });
      return toDomainMatchResult(row);
    },

    async findByMatch(matchId) {
      const row = await db.matchResult.findUnique({ where: { matchId } });
      return row ? toDomainMatchResult(row) : null;
    },
  };
}
