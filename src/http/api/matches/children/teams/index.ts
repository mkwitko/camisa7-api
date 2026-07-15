import type { FastifyPluginAsync } from "fastify";
import { generateTeamsRoute } from "./generate-teams/generate-teams.controller";
import { getTeamsRoute } from "./get-teams/get-teams.controller";
import { updateTeamsRoute } from "./update-teams/update-teams.controller";

/** Registers the `teams` child-resource routes under `/matches/:id/teams`. */
export const teamsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(generateTeamsRoute);
  await app.register(getTeamsRoute);
  await app.register(updateTeamsRoute);
};
