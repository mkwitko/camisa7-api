import type { FastifyPluginAsync } from "fastify";
import { membersRoutes } from "./children/members";
import { createGroupRoute } from "./create-group/create-group.controller";
import { getGroupRoute } from "./get-group/get-group.controller";
import { listMyGroupsRoute } from "./list-my-groups/list-my-groups.controller";
import { updateGroupRoute } from "./update-group/update-group.controller";

/** Registers all `groups` resource routes. All authenticated (no `config.public`). */
export const groupsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createGroupRoute);
  await app.register(listMyGroupsRoute);
  await app.register(getGroupRoute);
  await app.register(updateGroupRoute);
  await app.register(membersRoutes);
};
