import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

// Deliberately left UNSET (unlike `growth-content-feed.e2e.test.ts`) to
// exercise the config-gated 503. Isolated in its own file because `env.ts`
// caches its parsed config on first access for the lifetime of the module
// registry — Vitest's default `isolate: true` gives each e2e test file a
// fresh registry, so this file's "unset" and the sibling file's "set" never
// collide. Mirrors `growth-metrics-disabled.e2e.test.ts`.
delete process.env.GROWTH_SERVICE_TOKEN;

describe("GET /api/growth/content-feed (unconfigured)", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it("503s when GROWTH_SERVICE_TOKEN is not configured, even with a bearer token", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/growth/content-feed?from=2026-07-16T00:00:00Z&to=2026-07-17T00:00:00Z",
      headers: { authorization: "Bearer whatever" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("GRW-T0001");
  });
});
