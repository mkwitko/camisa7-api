import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { TeamsRepository } from "../../teams/teams.repository";
import type { MatchResultRepository } from "../result.repository";
import type { MatchResult, TeamScore } from "../result.types";

export type RecordResultDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  teamsRepo: TeamsRepository;
  resultRepo: MatchResultRepository;
};

export type RecordResultInput = {
  matchId: string;
  userId: string;
  scores: TeamScore[];
  winnerTeam?: number | null | undefined;
};

/** The team with the strictly highest `goals`; `null` (draw) if two or more tie for the max. */
function deriveWinner(scores: TeamScore[]): number | null {
  let maxGoals = -1;
  let winners: number[] = [];
  for (const s of scores) {
    if (s.goals > maxGoals) {
      maxGoals = s.goals;
      winners = [s.team];
    } else if (s.goals === maxGoals) {
      winners.push(s.team);
    }
  }
  return winners.length === 1 ? (winners[0] as number) : null;
}

/**
 * Owner closes out a match with its final score. `ERRORS.MTC.NOT_FINISHED()`
 * (409) unless the match is already `status: "finished"` — this task
 * deliberately does *not* transition status itself, `finish-match` (Fase 0)
 * remains the one place that does (see the `MatchResult` model's doc
 * comment in `prisma/schema.prisma`).
 *
 * `scores`' team indices must exactly match the match's persisted
 * `TeamAssignment` (if `generate-teams`/`update-teams` ran for it), or the
 * simple `{0,1}` pair when no split was ever generated — no missing team, no
 * unknown index, no duplicate. `ERRORS.RES.INVALID_SCORES()` (400)
 * otherwise. `winnerTeam`: given explicitly, it must be `null` (draw) or one
 * of `scores`' team indices; omitted, it's derived from `scores` (the team
 * with strictly the most goals — tied max is a draw).
 *
 * `upsert` (keyed by `matchId`) means recording twice corrects the same row
 * — the owner can resubmit to fix a mistaken entry.
 */
export function createRecordResultService(deps: RecordResultDeps) {
  return async (input: RecordResultInput): Promise<MatchResult> => {
    const match = await deps.matchesRepo.findById(input.matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    const { match: asserted } = assertMatchOwner(match, group, input.userId);

    if (asserted.status !== "finished") {
      throw ERRORS.MTC.NOT_FINISHED();
    }

    const scoreTeams = input.scores.map((s) => s.team);
    const uniqueScoreTeams = new Set(scoreTeams);
    if (uniqueScoreTeams.size !== scoreTeams.length) {
      throw ERRORS.RES.INVALID_SCORES({ reason: "duplicate_team" });
    }

    const assignment = await deps.teamsRepo.findByMatch(input.matchId);
    const validTeams = assignment ? new Set(assignment.teams.map((t) => t.team)) : new Set([0, 1]);

    const missing = [...validTeams].filter((t) => !uniqueScoreTeams.has(t));
    const unknown = [...uniqueScoreTeams].filter((t) => !validTeams.has(t));
    if (missing.length > 0 || unknown.length > 0) {
      throw ERRORS.RES.INVALID_SCORES({ reason: "team_mismatch", missing, unknown });
    }

    let winnerTeam: number | null;
    if (input.winnerTeam === undefined) {
      winnerTeam = deriveWinner(input.scores);
    } else if (input.winnerTeam === null) {
      winnerTeam = null;
    } else if (uniqueScoreTeams.has(input.winnerTeam)) {
      winnerTeam = input.winnerTeam;
    } else {
      throw ERRORS.RES.INVALID_SCORES({ reason: "unknown_winner", winnerTeam: input.winnerTeam });
    }

    return deps.resultRepo.upsert(input.matchId, {
      scores: input.scores,
      winnerTeam,
      recordedById: input.userId,
    });
  };
}
