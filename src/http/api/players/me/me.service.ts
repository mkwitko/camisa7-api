import type { PlayersRepository, ProfilePatch } from "@/http/api/players/players.repository";
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

/**
 * `PATCH /players/me` — the caller edits their OWN descriptive profile
 * (`affinity`/`attributes`/`skills`, all optional). Resolves (or lazily
 * provisions) the caller's `Player` first, then overwrites the given fields.
 */
export function createUpdateMyPlayerService(deps: MyPlayerDeps) {
  return async (userId: string, patch: ProfilePatch): Promise<Player> => {
    const player = await deps.playersRepo.findOrCreateForUser(userId);
    return deps.playersRepo.updateProfile(player.id, patch);
  };
}
