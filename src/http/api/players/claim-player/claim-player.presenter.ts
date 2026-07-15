import type { ClaimPlayerResponse } from "./claim-player.schema";
import type { ClaimPlayerResult } from "./claim-player.service";

/** Flattens the service's domain result into the API response shape. */
export function presentClaimResult(result: ClaimPlayerResult): ClaimPlayerResponse {
  return {
    player: {
      id: result.player.id,
      userId: result.player.userId,
      name: result.player.name,
      phone: result.player.phone,
    },
    summary: result.summary,
  };
}
