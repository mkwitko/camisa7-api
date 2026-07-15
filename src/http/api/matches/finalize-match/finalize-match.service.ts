import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { Match } from "@/http/api/matches/matches.types";
import { createFinalizeMatchCore, type FinalizeMatchCoreDeps } from "./finalize-match.core";

export type FinalizeMatchDeps = FinalizeMatchCoreDeps & { groupsRepo: GroupsRepository };

/**
 * Owner-gated `POST /matches/:id/finalize`. Authorizes via `assertMatchOwner`
 * (same primitive `finish-match`/`record-result`/`log-stats` use), then
 * delegates the actual finalize + career-recompute work to the shared
 * `createFinalizeMatchCore` (see that file's doc comment) — the cron
 * (`src/jobs/finalize-matches.job.ts`) reuses the same core without an
 * owner check, since it's system-triggered.
 */
export function createFinalizeMatchService(deps: FinalizeMatchDeps) {
  const core = createFinalizeMatchCore(deps);

  return async (matchId: string, userId: string): Promise<Match> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, userId);

    return core(matchId);
  };
}
