import { z } from "zod/v4";
import { PlayerLevelSchema } from "@/http/api/players/children/career/career.schema";

/**
 * `GET /players/suggestions` querystring — no coordinates in the URL: the
 * caller's own `User.lastLat`/`lastLng` (set via `PUT /me/location`) is the
 * search origin, resolved server-side by `get-suggestions.service.ts`.
 * `coerce` because query params arrive as strings.
 */
export const SuggestionsQuery = z.object({
  radiusKm: z.coerce.number().int().min(1).max(200).default(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SuggestionsQuery = z.infer<typeof SuggestionsQuery>;

/** One nearby, similar-level player suggestion. */
export const SuggestionResponse = z.object({
  playerId: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  city: z.string().nullable(),
  distanceKm: z.number(),
  overall: z.number().int(),
  level: PlayerLevelSchema,
});
export type Suggestion = z.infer<typeof SuggestionResponse>;

export const SuggestionsResponse = z.object({
  suggestions: z.array(SuggestionResponse),
});
export type SuggestionsResponse = z.infer<typeof SuggestionsResponse>;
