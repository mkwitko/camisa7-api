import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Gateways } from "@/types/fastify";

/**
 * Builds the real gateway instances from `env`. Empty object in Task 0 (no
 * AWS/JWT/Google gateways yet) — a later task fills this in as those gateways
 * are introduced.
 */
export function buildDefaultGateways(): Gateways {
  return {};
}

type GatewaysPluginOptions = { gateways?: Gateways };

const _gatewaysPlugin: FastifyPluginAsync<GatewaysPluginOptions> = async (app, opts) => {
  // Default: instância real (via buildDefaultGateways). Em teste, um set completo
  // de fakes é passado via opts.gateways (ver test/mocks/gateways.fake.ts).
  const gateways = opts.gateways ?? buildDefaultGateways();
  app.decorate("gateways", gateways);
};

export const gatewaysPlugin = fp(_gatewaysPlugin, { fastify: "5.x", name: "gateways" });
