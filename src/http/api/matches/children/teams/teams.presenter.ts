import type { TeamAssignmentResponse } from "./teams.schema";
import type { TeamAssignment } from "./teams.types";

/** Flattens a domain `TeamAssignment` into the API response shape. */
export function presentTeamAssignment(assignment: TeamAssignment): TeamAssignmentResponse {
  return {
    matchId: assignment.matchId,
    teams: assignment.teams.map((split) => ({
      team: split.team,
      players: split.players.map((p) => ({ playerId: p.playerId, name: p.name })),
    })),
    generatedAt: assignment.generatedAt,
  };
}
