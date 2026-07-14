import type { Gateways } from "@/types/fastify";

/**
 * Fake `Gateways` set for tests, substituted via `buildApp({ gateways })`. Empty
 * in Task 0 (no gateways yet — see `src/types/fastify.ts`). The first task that
 * adds a real gateway (jwt/google/push) also gives this an `overrides` param.
 */
export function buildFakeGateways(): Gateways {
  return {};
}
