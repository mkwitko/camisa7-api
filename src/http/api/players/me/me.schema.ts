import { z } from "zod/v4";

// The caller's own canonical `Player` (F1-7) — same shape as the domain
// `Player` type (`players.types.ts`), no projection: an owner may see
// everything about their own player, unlike `PublicProfileResponse`'s
// stripped-down shareable card.
export const MyPlayerResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  userId: z.string().nullable(),
});
export type MyPlayerResponse = z.infer<typeof MyPlayerResponse>;
