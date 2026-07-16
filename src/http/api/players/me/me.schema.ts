import { z } from "zod/v4";
import {
  AffinityValueSchema,
  PositionSchema,
} from "@/http/api/groups/children/members/members.schema";

// The caller's own canonical `Player` (F1-7) — same shape as the domain
// `Player` type (`players.types.ts`), no projection: an owner may see
// everything about their own player, unlike `PublicProfileResponse`'s
// stripped-down shareable card. `affinity` (Task 1, UX overhaul — FM rating
// model) is the player's OWN self-declared affinity map, never set by an
// organizer.
export const MyPlayerResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  userId: z.string().nullable(),
  affinity: z.partialRecord(PositionSchema, AffinityValueSchema),
});
export type MyPlayerResponse = z.infer<typeof MyPlayerResponse>;
