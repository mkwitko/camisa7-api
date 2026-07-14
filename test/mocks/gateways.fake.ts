import { env } from "@/config/env";
import { createJwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { Gateways } from "@/types/fastify";

/**
 * Fake `Gateways` set for tests, substituted via `buildApp({ gateways:
 * buildFakeGateways(overrides) })` — replaces the whole set, no partial merge
 * (ARCHITECTURE.md §4.4). `jwt` uses the REAL gateway (no external calls to
 * fake — it's pure crypto over env secrets) so signed tokens round-trip
 * through `verifyAccess`/`verifyRefresh` in e2e tests exactly like prod.
 */
export function buildFakeGateways(overrides: Partial<Gateways> = {}): Gateways {
  return {
    jwt: createJwtGateway({
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    }),
    ...overrides,
  };
}
