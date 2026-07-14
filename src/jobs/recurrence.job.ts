import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";

/**
 * Computes the next weekly occurrence's datetime: the next `weekday`
 * (0=Sun..6=Sat) + `time` ("HH:mm", UTC — matches are stored in UTC
 * end-to-end, see the company skill's DATES.md) strictly AFTER
 * `originalDatetime`. Anchors on the RULE's weekday+time, not the original
 * match's own time-of-day, since `update-match` can drift a match's
 * `datetime` away from its `recurrenceRule` without clearing the rule — the
 * rule is the single source of truth for where the series should land.
 */
function nextRecurrenceDatetime(
  originalDatetime: Date,
  rule: { weekday: number; time: string },
): Date {
  const [hours, minutes] = rule.time.split(":").map(Number);
  const candidate = new Date(
    Date.UTC(
      originalDatetime.getUTCFullYear(),
      originalDatetime.getUTCMonth(),
      originalDatetime.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    ),
  );

  const dayDiff = (rule.weekday - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + dayDiff);

  // Guarantees strictly-after even when the rule's weekday+time lands on or
  // before the original datetime (e.g. same weekday, earlier time-of-day).
  while (candidate.getTime() <= originalDatetime.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }

  return candidate;
}

/**
 * Cron body wired in `src/server.ts` (`node-cron`, every 15 minutes, skipped
 * when `NODE_ENV === "test"`). `now` is INJECTED — never read internally via
 * `Date.now()`/`new Date()` — so callers (and tests) can pin it.
 *
 * For each `finished` match with a weekly `recurrenceRule` and no future
 * `open`/`full` sibling yet in its group (see
 * `findFinishedRecurringWithoutFutureSibling`), spawns the next occurrence
 * via `createNextOccurrence`.
 */
export async function generateNextOccurrences(
  repo: MatchesRepository,
  now: Date,
): Promise<Match[]> {
  const candidates = await repo.findFinishedRecurringWithoutFutureSibling(now);

  const created: Match[] = [];
  for (const match of candidates) {
    if (!match.recurrenceRule) continue;
    const nextDatetime = nextRecurrenceDatetime(new Date(match.datetime), match.recurrenceRule);
    created.push(await repo.createNextOccurrence(match, nextDatetime));
  }

  return created;
}
