import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchStatsRepository, UpsertMatchStatInput } from "../stats.repository";
import type { MatchStat } from "../stats.types";

export type LogStatsDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  statsRepo: MatchStatsRepository;
};

export type LogStatsInput = {
  matchId: string;
  userId: string;
  stats: UpsertMatchStatInput[];
};

/**
 * Owner logs a batch of per-player stats for a finished match — Fase 1's
 * `stats_mode: organizador` only (the `colaborativo`/`stat_report` consensus
 * flow is a later fase, see `MatchStatSource` in `stats.types.ts`).
 *
 * `ERRORS.MTC.NOT_FINISHED()` (409) unless the match is already
 * `status: "finished"` — same gate `record-result` uses, since logging
 * stats before the match closes doesn't make sense. Every `playerId` in
 * `stats` must be a `confirmed` attendee of this match (not merely
 * known/waitlisted/cancelled) — `ERRORS.STAT.INELIGIBLE_PLAYER()` (400)
 * otherwise, naming the offending id.
 *
 * `upsertMany` (keyed by `(matchId, playerId)`) means re-logging the same
 * player corrects that row instead of accumulating history — the organizer
 * can resubmit the whole batch to fix a mistaken entry.
 */
export function createLogStatsService(deps: LogStatsDeps) {
  return async (input: LogStatsInput): Promise<MatchStat[]> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, input.userId);

    if (asserted.status !== "finished") {
      throw ERRORS.MTC.NOT_FINISHED();
    }

    const attendances = await deps.attendanceRepo.listByMatch(input.matchId);
    const confirmedPlayerIds = new Set(
      attendances.filter((a) => a.status === "confirmed").map((a) => a.player.id),
    );

    for (const entry of input.stats) {
      if (!confirmedPlayerIds.has(entry.playerId)) {
        throw ERRORS.STAT.INELIGIBLE_PLAYER({ playerId: entry.playerId });
      }
    }

    return deps.statsRepo.upsertMany(input.matchId, input.stats, "organizador");
  };
}
