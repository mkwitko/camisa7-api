import type { FastifyPluginAsync } from "fastify";
import { createConnectAccountRoute } from "./create-connect-account/create-connect-account.controller";
import { getConnectStatusRoute } from "./get-connect-status/get-connect-status.controller";

/**
 * Registers all `connect` resource routes (Marketplace V2: Stripe Connect
 * onboarding for court owners). All authenticated (no `config.public`).
 */
export const connectRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createConnectAccountRoute);
  await app.register(getConnectStatusRoute);
};
