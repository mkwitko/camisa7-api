import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import { ERRORS } from "@/shared/errors/catalog";
import type { PlayerCareerRepository } from "../career.repository";
import type { PlayerCareer } from "../career.types";

export type GetCareerDeps = {
  playersRepo: PlayersRepository;
  careerRepo: PlayerCareerRepository;
};

/**
 * Returns the player's global career — `null` when no finalized match has
 * ever recomputed one yet (the CALLER, `get-career.controller.ts` via
 * `presentPlayerCareer`, turns that into a 200 with a zeroed/bootstrap-
 * default body rather than a 404 — a brand-new player genuinely has "no
 * career, level bronze, zero everything" as a valid, expected answer, not
 * an error state).
 *
 * `ERRORS.PLR.NOT_FOUND()` (404) only for an unknown `playerId` — the
 * `Player` row itself must exist. No ownership/group-membership check:
 * this endpoint is authenticated-only for Fase 1 (any logged-in user may
 * look up any player's career) — a dedicated public, unauthenticated
 * profile page is F1-6, out of this task's scope.
 */
export function createGetCareerService(deps: GetCareerDeps) {
  return async (playerId: string): Promise<{ player: Player; career: PlayerCareer | null }> => {
    const player = await deps.playersRepo.findById(playerId);
    if (!player) throw ERRORS.PLR.NOT_FOUND();

    const career = await deps.careerRepo.findByPlayer(playerId);
    return { player, career };
  };
}
