import type { FastifyPluginAsync } from "fastify";
import { createInviteRoute } from "./create-invite/create-invite.controller";
import { publicConfirmRoute } from "./public-confirm/public-confirm.controller";
import { resolveInviteRoute } from "./resolve-invite/resolve-invite.controller";

/**
 * Registers all `invites` resource routes. `createInviteRoute` is
 * authenticated (group-owner only); `resolveInviteRoute` and
 * `publicConfirmRoute` are public (`config: { public: true }`) — see each
 * controller's doc comment.
 */
export const invitesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createInviteRoute);
  await app.register(resolveInviteRoute);
  await app.register(publicConfirmRoute);
};
