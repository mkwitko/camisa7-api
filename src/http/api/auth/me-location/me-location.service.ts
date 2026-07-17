import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";
import type { MeLocationBody } from "./me-location.schema";

export type UpdateMeLocationDeps = { repo: AuthRepository };

/**
 * Geo (G1): grava a última localização conhecida do jogador
 * (`lastCity/lastLat/lastLng`). Chamado quando o app captura a geo do device
 * (com coords) ou quando o jogador informa a cidade manualmente (só `city`).
 */
export function createUpdateMeLocationService(deps: UpdateMeLocationDeps) {
  return async (userId: string, body: MeLocationBody): Promise<User> => {
    return deps.repo.setLocation(userId, { lat: body.lat, lng: body.lng, city: body.city });
  };
}
