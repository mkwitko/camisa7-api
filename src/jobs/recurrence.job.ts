import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import { computeOccurrences } from "@/http/api/series/recurrence";
import type { SeriesRepository } from "@/http/api/series/series.repository";

const HORIZON = 4;

/**
 * Cron body wired in `src/server.ts` (`node-cron`, every 15 minutes, skipped
 * when `NODE_ENV === "test"`). `now` is INJECTED — never read internally via
 * `Date.now()`/`new Date()` — so callers (and tests) can pin it.
 *
 * Rolling-horizon materializer (replaces the old lazy
 * "finished match spawns its next occurrence" design): for every `active`
 * `MatchSeries` (`seriesRepo.listActive`), tops up its future `Match` rows to
 * `horizon`. Series with `rule.kind === "manual"` or `time === null` are not
 * generatable (`computeOccurrences` would return `[]` for the former; the
 * latter has no time-of-day to anchor on) — skipped without counting toward
 * the horizon. Anchors the next batch's `from` on the series' own last known
 * future occurrence (not `now`) so top-up runs never regress the cadence
 * (e.g. a biweekly series' next batch still lands on the right week), and
 * always passes the series' `startDate` through to `computeOccurrences` so
 * the interval phase (`weekIndex % interval`) stays anchored there rather
 * than drifting off `anchor`. A `endDate` upper bound stops a batch early —
 * `computeOccurrences` doesn't know about it — rather than inserting rows
 * the organizer explicitly capped the series against.
 *
 * `insertOccurrence`'s `try`/`catch` makes a re-run idempotent: the DB's
 * `@@unique([seriesId, datetime])` constraint (see `schema.prisma`) rejects a
 * duplicate insert for a date this job (or a concurrent run) already
 * created, and that's treated as "already exists" rather than a failure.
 */
export async function generateHorizon(
  seriesRepo: SeriesRepository,
  matchesRepo: MatchesRepository,
  now: Date,
  horizon = HORIZON,
): Promise<Match[]> {
  const series = await seriesRepo.listActive(now);
  const created: Match[] = [];

  for (const s of series) {
    if (s.rule.kind === "manual" || s.time === null) continue;

    const existing = await matchesRepo.countFutureBySeries(s.id, now);
    const need = horizon - existing;
    if (need <= 0) continue;

    const future = await matchesRepo.listBySeriesFuture(s.id, now);
    const lastFuture = future.at(-1);
    const anchor = lastFuture ? new Date(lastFuture.datetime) : now;
    const upperBound = s.endDate ? new Date(s.endDate) : null;

    const dates = computeOccurrences(s.rule, s.time, anchor, need, new Date(s.startDate));
    for (const date of dates) {
      if (upperBound && date.getTime() > upperBound.getTime()) break;
      try {
        created.push(
          await matchesRepo.insertOccurrence({
            seriesId: s.id,
            groupId: s.groupId,
            datetime: date.toISOString(),
            location: s.location,
            priceCents: s.priceCents,
            slots: s.slots,
            pixKey: s.pixKey,
          }),
        );
      } catch {
        // unique([seriesId, datetime]) violated → already exists, idempotent skip.
      }
    }
  }

  return created;
}
