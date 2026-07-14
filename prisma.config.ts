// Prisma 7 removed automatic `.env` loading from the CLI, so we load it
// explicitly here (needed for `pnpm db:migrate` / `pnpm db:generate` in local
// dev; CI/Testcontainers export DATABASE_URL directly, no .env involved).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
