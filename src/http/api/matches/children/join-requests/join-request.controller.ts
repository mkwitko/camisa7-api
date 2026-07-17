import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAttendanceRepository } from "../attendance/attendance.repository";
import { presentJoinRequest, presentPendingJoinRequest } from "./join-request.presenter";
import { createJoinRequestRepository } from "./join-request.repository";
import {
  DecideJoinRequestBody,
  DecideJoinRequestParams,
  JoinRequestListResponse,
  JoinRequestParams,
  JoinRequestResponse,
} from "./join-request.schema";
import { createJoinRequestService } from "./join-request.service";

/** Composes the join-request service against the shared Prisma client + push gateway. */
function buildService(app: FastifyInstance) {
  return createJoinRequestService({
    joinRequestRepo: createJoinRequestRepository(prisma),
    playersRepo: createPlayersRepository(prisma),
    matchesRepo: createMatchesRepository(prisma),
    groupsRepo: createGroupsRepository(prisma),
    attendanceRepo: createAttendanceRepository(prisma),
    authRepo: createAuthRepository(prisma),
    push: app.gateways.push,
  });
}

/**
 * Geo G3 (Fase 2) join-request routes under `/matches/:id/...`. All
 * authenticated; the two organizer routes (list + decision) authorize via
 * `assertMatchOwner` inside the service.
 */
export const joinRequestRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/matches/:id/join-request",
    {
      schema: {
        operationId: "requestJoin",
        tags: ["join-requests"],
        params: JoinRequestParams,
        response: { 201: JoinRequestResponse },
      },
    },
    async (req, reply) => {
      const { userId } = requireUser(req);
      const request = await buildService(app).requestJoin(req.params.id, userId);
      void reply.code(201).send(presentJoinRequest(request));
    },
  );

  typed.get(
    "/matches/:id/join-requests",
    {
      schema: {
        operationId: "listJoinRequests",
        tags: ["join-requests"],
        params: JoinRequestParams,
        response: { 200: JoinRequestListResponse },
      },
    },
    async (req, reply) => {
      const { userId } = requireUser(req);
      const requests = await buildService(app).listRequests(req.params.id, userId);
      void reply.code(200).send(requests.map(presentPendingJoinRequest));
    },
  );

  typed.post(
    "/matches/:id/join-requests/:reqId/decision",
    {
      schema: {
        operationId: "decideJoinRequest",
        tags: ["join-requests"],
        params: DecideJoinRequestParams,
        body: DecideJoinRequestBody,
        response: { 200: JoinRequestResponse },
      },
    },
    async (req, reply) => {
      const { userId } = requireUser(req);
      const request = await buildService(app).decide(
        req.params.id,
        req.params.reqId,
        userId,
        req.body.approve,
      );
      void reply.code(200).send(presentJoinRequest(request));
    },
  );
};
