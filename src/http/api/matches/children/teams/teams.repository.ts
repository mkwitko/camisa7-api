import type { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import type { TeamAssignment, TeamSplit } from "./teams.types";

type TeamAssignmentRow = {
  matchId: string;
  teams: unknown;
  updatedAt: Date;
};

function toDomainTeamAssignment(row: TeamAssignmentRow): TeamAssignment {
  return {
    matchId: row.matchId,
    teams: row.teams as TeamSplit[],
    generatedAt: row.updatedAt.toISOString(),
  };
}

export interface TeamsRepository {
  /** Upsert keyed by `matchId` — `generate-teams`/`update-teams` both replace the same row rather than accumulate history. */
  save(matchId: string, teams: TeamSplit[]): Promise<TeamAssignment>;
  findByMatch(matchId: string): Promise<TeamAssignment | null>;
}

/** Factory `createTeamsRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createTeamsRepository(db: PrismaLike): TeamsRepository {
  return {
    async save(matchId, teams) {
      const row = await db.teamAssignment.upsert({
        where: { matchId },
        create: { matchId, teams: teams as unknown as Prisma.InputJsonValue },
        update: { teams: teams as unknown as Prisma.InputJsonValue },
      });
      return toDomainTeamAssignment(row);
    },

    async findByMatch(matchId) {
      const row = await db.teamAssignment.findUnique({ where: { matchId } });
      return row ? toDomainTeamAssignment(row) : null;
    },
  };
}
