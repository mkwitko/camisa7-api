import type { FastifyInstance } from "fastify";
import { buildApp } from "@/app";
import { buildFakeGateways } from "../../mocks/gateways.fake";

export type TestApp = {
  app: FastifyInstance;
  close: () => Promise<void>;
};

/**
 * Builds an app for e2e tests via `fastify.inject` (no socket/port).
 *
 * Task 0 has no DB layer yet (`src/infra/db/*` and migrations land in a later
 * task), so this doesn't spin up the Testcontainers Postgres described in the
 * skill's TESTING.md §5 yet — `/health` doesn't touch the DB either. The
 * `TestApp` shape (`app`/`close`) is kept stable on purpose: the task that
 * introduces the DB client + migrations extends this helper's body (container
 * start/stop, `pool`/`db` on the returned object) without changing call sites.
 */
export async function buildTestApp(): Promise<TestApp> {
  const app = await buildApp({ gateways: buildFakeGateways() });
  return {
    app,
    close: async () => {
      await app.close();
    },
  };
}
