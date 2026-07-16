import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "@/config/env";
import { createGoogleGateway } from "@/gateways/google/google.gateway";
import { createJwtGateway } from "@/gateways/jwt/jwt.gateway";
import { createPushGateway } from "@/gateways/push/push.gateway";
import type { Gateways } from "@/types/fastify";

/**
 * Builds the real gateway instances from `env`. `jwt` is the own JWT gateway
 * (Task 2) — no Cognito. `google` verifies Sign-In ID tokens against the
 * comma-separated `GOOGLE_CLIENT_IDS` (Task 3). `push` sends FCM notifications
 * (Task 12) via firebase-admin — enabled only when `GOOGLE_APPLICATION_CREDENTIALS`
 * points to a service-account JSON; otherwise push is a silent no-op.
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
    push: createPushGateway({ enabled: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS) }),
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
