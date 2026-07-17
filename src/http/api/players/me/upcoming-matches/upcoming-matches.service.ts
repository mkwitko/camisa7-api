import type { PlayersRepository } from "@/http/api/players/players.repository";
import type {
  UpcomingMatchesRepository,
  UpcomingMatchForPlayer,
} from "./upcoming-matches.repository";

export type UpcomingMatchesDeps = {
  playersRepo: PlayersRepository;
  upcomingRepo: UpcomingMatchesRepository;
};

/** How many upcoming matches the home screen shows at most. */
const UPCOMING_LIMIT = 20;

/**
 * `GET /players/me/upcoming-matches` — resolves the caller's canonical
 * `Player`, then lists their future matches across all groups (with the
 * caller's attendance status) for the "Início" home screen. `now` is injected
 * so the aggregation is deterministic under test.
 */
export function createUpcomingMatchesService(deps: UpcomingMatchesDeps) {
  return async (userId: string, now: Date): Promise<UpcomingMatchForPlayer[]> => {
    const player = await deps.playersRepo.findOrCreateForUser(userId);
    return deps.upcomingRepo.listUpcomingForPlayer(player.id, now, UPCOMING_LIMIT);
  };
}
