import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@/generated/prisma/client";
import { startTestDb } from "../../integration/helpers/db";
import { buildFakeGateways } from "../../mocks/gateways.fake";

export type TestApp = {
  app: FastifyInstance;
  prisma: PrismaClient;
  close: () => Promise<void>;
};

/**
 * Builds an app for e2e tests via `fastify.inject` (no socket/port).
 *
 * Task 2 is the first task where a route touches the DB (register/login/me
 * write/read real `User` rows), so this now spins up a disposable
 * Testcontainers Postgres and runs the committed migrations against it
 * (reusing `startTestDb` from the integration helpers — same "throwaway
 * container, `migrate deploy`" recipe, see TESTING.md §4.1).
 *
 * IMPORTANT: `@/app` (and everything it imports, transitively including
 * `src/infra/db/client.ts`'s `prisma` singleton) is imported *dynamically*,
 * after `process.env.DATABASE_URL` is pointed at the container. `client.ts`
 * reads `env.DATABASE_URL` at module-evaluation time — a static top-level
 * `import { buildApp } from "@/app"` here would run before the container
 * exists and permanently bind `prisma` to the dummy URL from
 * `test/helpers/dummy-env.ts` instead.
 */
export async function buildTestApp(): Promise<TestApp> {
  const testDb = await startTestDb();
  process.env.DATABASE_URL = testDb.connectionString;

  const { buildApp } = await import("@/app");
  const { prisma: appPrisma } = await import("@/infra/db/client");

  const app = await buildApp({ gateways: buildFakeGateways() });

  return {
    app,
    prisma: testDb.prisma,
    close: async () => {
      await app.close();
      await appPrisma.$disconnect();
      await testDb.stop();
    },
  };
}
