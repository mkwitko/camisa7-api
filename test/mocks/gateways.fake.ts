import { env } from "@/config/env";
import type { GoogleGateway } from "@/gateways/google/google.gateway";
import { createJwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { PushGateway } from "@/gateways/push/push.gateway";
import { ERRORS } from "@/shared/errors/catalog";
import type { Gateways } from "@/types/fastify";

/**
 * Fake `GoogleGateway` — no real Google network call. Decodes the test-only
 * convention `"g:<sub>:<email>:<name>"` instead of verifying a real ID token
 * signature; anything else (garbage, empty, wrong prefix) is rejected exactly
 * like a real invalid token would be, via `AUTH-T0005`.
 */
function createFakeGoogleGateway(): GoogleGateway {
  return {
    async verifyIdToken(idToken) {
      const parts = idToken.split(":");
      const [prefix, googleSub, email, ...rest] = parts;
      const name = rest.join(":");
      if (prefix !== "g" || !googleSub || !email || !name) {
        throw ERRORS.AUTH.INVALID_GOOGLE_TOKEN();
      }
      return { googleSub, email, name };
    },
  };
}

export type FakePushGateway = PushGateway & {
  /** Every `send` call recorded, in order — asserted on directly in e2e tests (Task 12). */
  calls: Array<{ to: string; title: string; body: string; data?: Record<string, string> }>;
};

/** Fake `PushGateway` — no real Expo HTTP call, just records every `send` for assertions. */
function createFakePushGateway(): FakePushGateway {
  const calls: FakePushGateway["calls"] = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
    },
  };
}

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
    google: createFakeGoogleGateway(),
    push: createFakePushGateway(),
    ...overrides,
  };
}
