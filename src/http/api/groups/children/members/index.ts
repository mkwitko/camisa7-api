import type { FastifyPluginAsync } from "fastify";
import { addMemberRoute } from "./add-member/add-member.controller";
import { listMembersRoute } from "./list-members/list-members.controller";
import { updateMemberRoute } from "./update-member/update-member.controller";

/** Registers the `members` child-resource routes under `/groups/:id/members`. */
export const membersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(addMemberRoute);
  await app.register(listMembersRoute);
  await app.register(updateMemberRoute);
};
