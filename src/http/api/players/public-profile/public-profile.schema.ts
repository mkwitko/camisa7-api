import { z } from "zod/v4";
import { PositionSchema } from "@/http/api/groups/children/members/members.schema";
import { OverallValueSchema, PlayerLevelSchema } from "../children/career/career.schema";

export const PublicProfileParams = z.object({
  playerId: z.uuid(),
});
export type PublicProfileParams = z.infer<typeof PublicProfileParams>;

// The shareable "Strava card" (design doc §1/§5.2 step 12) — a PUBLIC-SAFE
// projection of `Player` + `PlayerCareer`. Deliberately excludes `phone`,
// `email`, `userId`, group memberships and per-match detail: only `name` +
// aggregate career numbers, the same fields the futebol-web card renders.
export const PublicProfileResponse = z.object({
  playerId: z.uuid(),
  name: z.string(),
  level: PlayerLevelSchema,
  overallByPosition: z.partialRecord(PositionSchema, OverallValueSchema),
  bestOverall: OverallValueSchema,
  // `null` only for the zeroed/bootstrap profile (no `overallByPosition`
  // entries yet) — see `public-profile.presenter.ts`.
  bestPosition: PositionSchema.nullable(),
  matchesPlayed: z.number().int().min(0),
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
  winRate: z.number().min(0).max(1),
  goals: z.number().int().min(0),
  assists: z.number().int().min(0),
  cleanSheets: z.number().int().min(0),
  mvpCount: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
});
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;
