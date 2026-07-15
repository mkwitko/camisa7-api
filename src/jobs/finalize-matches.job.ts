import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";

const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Cron body wired in `src/server.ts` (`node-cron`, skipped when
 * `NODE_ENV === "test"` — same convention `recurrence.job.ts` uses). `now`
 * is INJECTED — never read internally via `Date.now()`/`new Date()` — so
 * callers (and tests) can pin it, exercising "the 48h window has elapsed"
 * without waiting on real time.
 *
 * Auto-finalizes every match whose voting window has elapsed: `"finished"`
 * (not yet `"closed"`), a `MatchResult` recorded, and `datetime + 48h < now`
 * (§5.2 step 11 of the design doc: "ao encerrar resultado + janela de votos,
 * job recalcula player_career"). Delegates the actual finalize +
 * career-recompute work to `finalizeOne` (the caller passes the owner-
 * agnostic `createFinalizeMatchCore` from `finalize-match.core.ts` — this
 * job has no acting user, unlike the HTTP `finalize-match` endpoint).
 */
export async function finalizeElapsedMatches(
  deps: { matchesRepo: MatchesRepository; finalizeOne: (matchId: string) => Promise<Match> },
  now: Date,
): Promise<Match[]> {
  const votingDeadline = new Date(now.getTime() - VOTING_WINDOW_MS);
  const candidates = await deps.matchesRepo.findFinishedElapsedWithResult(votingDeadline);

  const finalized: Match[] = [];
  for (const match of candidates) {
    finalized.push(await deps.finalizeOne(match.id));
  }
  return finalized;
}
