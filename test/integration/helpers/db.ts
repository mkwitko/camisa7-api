import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@/generated/prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const prismaBin = path.resolve(projectRoot, "node_modules/.bin/prisma");

export type TestDb = {
  prisma: PrismaClient;
  container: StartedPostgreSqlContainer;
  connectionString: string;
  stop: () => Promise<void>;
};

/**
 * Spins up a throwaway `postgres:16-alpine` container via Testcontainers,
 * applies the committed migrations against it (`prisma migrate deploy` —
 * never `migrate dev`, this is a disposable DB, not a dev shadow-db flow),
 * then returns a PrismaClient bound to that container via the pg adapter.
 */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();

  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  return {
    prisma,
    container,
    connectionString,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
