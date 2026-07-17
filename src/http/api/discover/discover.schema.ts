import { z } from "zod/v4";
import { JoinPolicySchema } from "@/http/api/groups/groups.schema";
import { ModalitySchema } from "@/http/api/matches/matches.schema";

/**
 * `GET /discover` querystring. Coordinates are required; `radiusKm` defaults to
 * 10 and is capped at 50. `coerce` because query params arrive as strings.
 */
export const DiscoverQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(50).default(10),
  modality: ModalitySchema.optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuery>;

export const DiscoveredMatchResponse = z.object({
  matchId: z.uuid(),
  groupId: z.uuid(),
  groupName: z.string(),
  datetime: z.string(),
  location: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  confirmedCount: z.number().int(),
  distanceKm: z.number(),
  modality: ModalitySchema,
  joinPolicy: JoinPolicySchema,
  full: z.boolean(),
});
export type DiscoveredMatchResponse = z.infer<typeof DiscoveredMatchResponse>;

export const DiscoverResponse = z.array(DiscoveredMatchResponse);
export type DiscoverResponse = z.infer<typeof DiscoverResponse>;
