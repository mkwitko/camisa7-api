import type { FastifyPluginAsync } from "fastify";
import { cancelMatchRoute } from "./cancel-match/cancel-match.controller";
import { attendanceRoutes } from "./children/attendance/index";
import { teamsRoutes } from "./children/teams/index";
import { createMatchRoute } from "./create-match/create-match.controller";
import { getMatchRoute } from "./get-match/get-match.controller";
import { listMatchesRoute } from "./list-matches/list-matches.controller";
import { updateMatchRoute } from "./update-match/update-match.controller";

/**
 * Registers all `matches` resource routes. All authenticated (no
 * `config.public`). Create/list are nested under the parent group
 * (`/groups/:id/matches` — you need the group id to create or scope a
 * list); get/update/cancel are flat (`/matches/:id`, `/matches/:id/cancel`)
 * since a match is fully addressable by its own id and `assertMatchOwner`
 * resolves the parent group from `match.groupId` (see `matches.authz.ts`).
 */
export const matchesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createMatchRoute);
  await app.register(listMatchesRoute);
  await app.register(getMatchRoute);
  await app.register(updateMatchRoute);
  await app.register(cancelMatchRoute);
  await app.register(attendanceRoutes);
  await app.register(teamsRoutes);
};
