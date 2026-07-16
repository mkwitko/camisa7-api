import "dotenv/config"; // load .env for local dev (prod injects real env vars)
import cron from "node-cron";
import { buildApp } from "@/app";
import { env } from "@/config/env";
import { createDuesRepository } from "@/http/api/dues/dues.repository";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "@/http/api/matches/children/result/result.repository";
import { createFinalizeMatchCore } from "@/http/api/matches/finalize-match/finalize-match.core";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createSeriesRepository } from "@/http/api/series/series.repository";
import { prisma } from "@/infra/db/client";
import { logger } from "@/infra/observability/logger";
import { finalizeElapsedMatches } from "@/jobs/finalize-matches.job";
import { generateMonthlyDues } from "@/jobs/membership-dues.job";
import { generateHorizon } from "@/jobs/recurrence.job";

/**
 * Recurrence cron (Task 8) — every 15 minutes, tops up each `active`
 * `MatchSeries`'s future `Match` rows to a rolling horizon (see
 * `generateHorizon` in `recurrence.job.ts`). Not started under
 * `NODE_ENV === "test"`: e2e/integration suites build their own app
 * instances against throwaway Testcontainers DBs (see
 * `test/e2e/helpers/app.ts`) and don't want a background timer touching
 * `prisma`/reaching across test runs.
 */
function startRecurrenceCron(): void {
  const seriesRepo = createSeriesRepository(prisma);
  const matchesRepo = createMatchesRepository(prisma);
  cron.schedule("*/15 * * * *", () => {
    generateHorizon(seriesRepo, matchesRepo, new Date()).catch((err: unknown) => {
      logger.error({ err }, "recurrence.job.failed");
    });
  });
}

/**
 * Finalize cron (Task 17, F1-4) — every 15 minutes, auto-finalizes matches
 * whose 48h voting window has elapsed (see `finalize-matches.job.ts`).
 * Skipped under `NODE_ENV === "test"`, same rationale as the recurrence
 * cron above.
 */
function startFinalizeCron(): void {
  const matchesRepo = createMatchesRepository(prisma);
  const finalizeOne = createFinalizeMatchCore({
    matchesRepo,
    resultRepo: createMatchResultRepository(prisma),
    attendanceRepo: createAttendanceRepository(prisma),
    careerRepo: createPlayerCareerRepository(prisma),
  });
  cron.schedule("*/15 * * * *", () => {
    finalizeElapsedMatches({ matchesRepo, finalizeOne }, new Date()).catch((err: unknown) => {
      logger.error({ err }, "finalize.job.failed");
    });
  });
}

/**
 * Membership-dues cron (Task 6) — once a day, ensures every `mensalista`
 * `GroupMember` with a resolvable fee (`monthlyFeeCentsOverride ?? group.
 * monthlyFeeCents`) has a `MembershipDue` for the current competency month
 * (see `generateMonthlyDues` in `membership-dues.job.ts`). `ensureForMember`
 * upserts idempotently, so unlike the 15-minute recurrence/finalize crons a
 * daily cadence is plenty — there's no harm in running it more or less often.
 * Skipped under `NODE_ENV === "test"`, same rationale as the other crons.
 */
function startMembershipDuesCron(): void {
  const duesRepo = createDuesRepository(prisma);
  cron.schedule("0 6 * * *", () => {
    generateMonthlyDues(duesRepo, new Date()).catch((err: unknown) => {
      logger.error({ err }, "membership-dues.job.failed");
    });
  });
}

async function start(): Promise<void> {
  const app = await buildApp();

  if (env.NODE_ENV !== "test") {
    startRecurrenceCron();
    startFinalizeCron();
    startMembershipDuesCron();
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
