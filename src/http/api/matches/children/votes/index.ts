import type { FastifyPluginAsync } from "fastify";
import { castVoteRoute } from "./cast-vote/cast-vote.controller";
import { listVoteTallyRoute } from "./list-vote-tally/list-vote-tally.controller";

/** Registers the `votes` child-resource routes under `/matches/:id/votes`. */
export const votesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(castVoteRoute);
  await app.register(listVoteTallyRoute);
};
