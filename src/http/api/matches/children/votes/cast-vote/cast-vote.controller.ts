import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentVote } from "../votes.presenter";
import { createVotesRepository } from "../votes.repository";
import { VoteResponse } from "../votes.schema";
import { CastVoteBody, CastVoteParams } from "./cast-vote.schema";
import { createCastVoteService } from "./cast-vote.service";

export const castVoteRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/votes",
    {
      schema: {
        operationId: "castVote",
        tags: ["votes"],
        params: CastVoteParams,
        body: CastVoteBody,
        response: { 200: VoteResponse },
      },
    },
    async (req, reply) => {
      const service = createCastVoteService({
        matchesRepo: createMatchesRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        votesRepo: createVotesRepository(prisma),
      });
      const { userId } = requireUser(req);
      const vote = await service({
        matchId: req.params.id,
        userId,
        category: req.body.category,
        votedPlayerId: req.body.votedPlayerId,
      });
      void reply.code(200).send(presentVote(vote));
    },
  );
};
