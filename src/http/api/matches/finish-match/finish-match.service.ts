import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { ERRORS } from "@/shared/errors/catalog";
import { assertMatchOwner } from "../matches.authz";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";

export type FinishMatchDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

/**
 * Owner finishes a match — sets `status: "finished"`, closing it out as a
 * historical record. After this, `update-match` rejects field edits with
 * `MTC-T0002`, and the recurrence cron (`src/jobs/recurrence.job.ts`) picks
 * the match up to spawn its next occurrence if it carries a
 * `recurrenceRule`. An already-`finished` or -`cancelled` match rejects with
 * the same `NOT_EDITABLE` error `update-match` uses — "finish an
 * already-closed match" is the same stale state-transition attempt.
 */
export function createFinishMatchService(deps: FinishMatchDeps) {
  return async (matchId: string, userId: string): Promise<Match> => {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, userId);

    if (asserted.status === "finished" || asserted.status === "cancelled") {
      throw ERRORS.MTC.NOT_EDITABLE();
    }

    return deps.matchesRepo.setStatus(matchId, "finished");
  };
}
