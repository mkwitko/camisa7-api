import type { PrismaLike } from "@/infra/db/client";
import type { JoinRequest, JoinRequestStatus, PendingJoinRequest } from "./join-request.types";

type JoinRequestRow = {
  id: string;
  matchId: string;
  playerId: string;
  status: string;
  decidedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: JoinRequestRow): JoinRequest {
  return {
    id: row.id,
    matchId: row.matchId,
    playerId: row.playerId,
    status: row.status as JoinRequestStatus,
    decidedById: row.decidedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface JoinRequestRepository {
  /** Creates a fresh `pending` request for `(matchId, playerId)`. */
  create(matchId: string, playerId: string): Promise<JoinRequest>;
  /**
   * The single request for `(matchId, playerId)` if any — the `@@unique`
   * guarantees at most one. Used by `requestJoin` to decide between
   * `ALREADY_REQUESTED` (already `pending`), `reopen` (a prior
   * `rejected`/`approved` row), or a fresh `create`.
   */
  findByMatchAndPlayer(matchId: string, playerId: string): Promise<JoinRequest | null>;
  /**
   * Reopens a previously-decided request: status back to `pending`,
   * `decidedById` cleared. Lets a player ask again after a rejection without
   * violating the full `@@unique([matchId, playerId])`.
   */
  reopen(id: string): Promise<JoinRequest>;
  /** Pending requests for a match (oldest first), each with the player's name. */
  listPendingByMatch(matchId: string): Promise<PendingJoinRequest[]>;
  findById(id: string): Promise<JoinRequest | null>;
  /** Sets the decision state + acting owner id (`setStatus` itself does no authz). */
  setStatus(
    id: string,
    status: JoinRequestStatus,
    decidedById: string | null,
  ): Promise<JoinRequest>;
}

/** Factory `createJoinRequestRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createJoinRequestRepository(db: PrismaLike): JoinRequestRepository {
  return {
    async create(matchId, playerId) {
      const row = await db.joinRequest.create({
        data: { matchId, playerId, status: "pending" },
      });
      return toDomain(row);
    },

    async findByMatchAndPlayer(matchId, playerId) {
      const row = await db.joinRequest.findUnique({
        where: { matchId_playerId: { matchId, playerId } },
      });
      return row ? toDomain(row) : null;
    },

    async reopen(id) {
      const row = await db.joinRequest.update({
        where: { id },
        data: { status: "pending", decidedById: null },
      });
      return toDomain(row);
    },

    async listPendingByMatch(matchId) {
      const rows = await db.joinRequest.findMany({
        where: { matchId, status: "pending" },
        include: { player: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        matchId: row.matchId,
        playerId: row.playerId,
        playerName: row.player.name,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async findById(id) {
      const row = await db.joinRequest.findUnique({ where: { id } });
      return row ? toDomain(row) : null;
    },

    async setStatus(id, status, decidedById) {
      const row = await db.joinRequest.update({
        where: { id },
        data: { status, decidedById },
      });
      return toDomain(row);
    },
  };
}
