import type { z } from "zod/v4";
import type { JoinRequestResponse, PendingJoinRequestResponse } from "./join-request.schema";
import type { JoinRequest, PendingJoinRequest } from "./join-request.types";

export function presentJoinRequest(request: JoinRequest): JoinRequestResponse {
  return {
    id: request.id,
    matchId: request.matchId,
    playerId: request.playerId,
    status: request.status,
    decidedById: request.decidedById,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export function presentPendingJoinRequest(
  request: PendingJoinRequest,
): z.infer<typeof PendingJoinRequestResponse> {
  return {
    id: request.id,
    matchId: request.matchId,
    playerId: request.playerId,
    playerName: request.playerName,
    createdAt: request.createdAt,
  };
}
