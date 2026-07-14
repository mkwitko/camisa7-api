import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "@/config/env";
import { createGoogleGateway } from "@/gateways/google/google.gateway";
import { createJwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { Gateways } from "@/types/fastify";

/**
 * Builds the real gateway instances from `env`. `jwt` is the own JWT gateway
 * (Task 2) — no Cognito. `google` verifies Sign-In ID tokens against the
 * comma-separated `GOOGLE_CLIENT_IDS` (Task 3). A later task adds `push`.
 */
export function buildDefaultGateways(): Gateways {
  return {
    jwt: createJwtGateway({
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    }),
    google: createGoogleGateway({
      clientIds: env.GOOGLE_CLIENT_IDS.split(",").map((id) => id.trim()),
    }),
  };
}

type GatewaysPluginOptions = { gateways?: Gateways };

const _gatewaysPlugin: FastifyPluginAsync<GatewaysPluginOptions> = async (app, opts) => {
  // Default: instância real (via buildDefaultGateways). Em teste, um set completo
  // de fakes é passado via opts.gateways (ver test/mocks/gateways.fake.ts).
  const gateways = opts.gateways ?? buildDefaultGateways();
  app.decorate("gateways", gateways);
};

export const gatewaysPlugin = fp(_gatewaysPlugin, { fastify: "5.x", name: "gateways" });
