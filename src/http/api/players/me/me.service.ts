import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";

export type MyPlayerDeps = { playersRepo: PlayersRepository };

/**
 * Resolves the caller's canonical `Player` (F1-7) — a thin wrapper over
 * `findOrCreateForUser` (see that method's doc comment for the
 * reuse/creation/race-safety behavior), added so the app can chain
 * `getMyPlayer` -> `getPlayerCareer(player.id)` for the "my career" screen
 * without having to already know its own `playerId`.
 */
export function createMyPlayerService(deps: MyPlayerDeps) {
  return async (userId: string): Promise<Player> => {
    return deps.playersRepo.findOrCreateForUser(userId);
  };
}
