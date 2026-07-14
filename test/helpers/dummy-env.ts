/**
 * Dummy env vars so `env.ts` (Zod-validated, fail-fast on first access) parses
 * successfully in test projects that don't set their own real env. Shared by
 * `test/setup-e2e.ts` and `test/setup-integration.ts`.
 */
export function setDummyEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/futebol_test";
  process.env.JWT_ACCESS_SECRET ??= "test-access-secret-at-least-16-chars";
  process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-at-least-16-chars";
  process.env.GOOGLE_CLIENT_IDS ??= "test-google-client-id";
}
