import type { FastifyPluginAsync } from "fastify";
import { confirmDueRoute } from "./confirm-due/confirm-due.controller";
import { listGroupDuesRoute } from "./list-dues/list-dues.controller";
import { markPaidDueRoute } from "./mark-paid-due/mark-paid-due.controller";

/** Registers the `dues` resource routes: `/groups/:groupId/dues`, `/dues/:id/mark-paid`, `/dues/:id/confirm`. */
export const duesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(listGroupDuesRoute);
  await app.register(markPaidDueRoute);
  await app.register(confirmDueRoute);
};
