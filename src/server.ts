import cron from "node-cron";
import { buildApp } from "@/app";
import { env } from "@/config/env";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { prisma } from "@/infra/db/client";
import { logger } from "@/infra/observability/logger";
import { generateNextOccurrences } from "@/jobs/recurrence.job";

/**
 * Recurrence cron (Task 11) — every 15 minutes, scans `finished` recurring
 * matches with no future sibling yet and spawns their next occurrence. Not
 * started under `NODE_ENV === "test"`: e2e/integration suites build their
 * own app instances against throwaway Testcontainers DBs (see
 * `test/e2e/helpers/app.ts`) and don't want a background timer touching
 * `prisma`/reaching across test runs.
 */
function startRecurrenceCron(): void {
  const matchesRepo = createMatchesRepository(prisma);
  cron.schedule("*/15 * * * *", () => {
    generateNextOccurrences(matchesRepo, new Date()).catch((err: unknown) => {
      logger.error({ err }, "recurrence.job.failed");
    });
  });
}

async function start(): Promise<void> {
  const app = await buildApp();

  if (env.NODE_ENV !== "test") {
    startRecurrenceCron();
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, "server.shutting_down");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, "server.started");
}

start().catch((err: unknown) => {
  logger.error({ err }, "server.failed_to_start");
  process.exit(1);
});
