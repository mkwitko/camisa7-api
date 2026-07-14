import type { FastifyPluginAsync } from "fastify";
import { loginRoute } from "./login/login.controller";
import { meRoute } from "./me/me.controller";
import { registerRoute } from "./register/register.controller";

/** Registers all `auth` resource routes. Auth (public vs. bearer) is per-route via `config.public`. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  await app.register(registerRoute);
  await app.register(loginRoute);
  await app.register(meRoute);
};
