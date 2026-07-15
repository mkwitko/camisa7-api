import type { FastifyPluginAsync } from "fastify";
import { getResultRoute } from "./get-result/get-result.controller";
import { recordResultRoute } from "./record-result/record-result.controller";

/** Registers the `result` child-resource routes under `/matches/:id/result`. */
export const resultRoutes: FastifyPluginAsync = async (app) => {
  await app.register(recordResultRoute);
  await app.register(getResultRoute);
};
