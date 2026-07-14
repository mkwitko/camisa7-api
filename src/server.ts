import { buildApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/infra/observability/logger";

async function start(): Promise<void> {
  const app = await buildApp();

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
