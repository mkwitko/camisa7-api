import { z } from "zod/v4";
import { FieldPositionSchema } from "@/http/api/groups/children/members/members.schema";
import { OverallValueSchema, PlayerLevelSchema } from "../children/career/career.schema";

// `playerId` here is uuid OR slug (Task 1, share-carta): resolved to the
// real id in the controller before the service ever sees it — the service's
// own `playerId` stays a strict uuid.
export const PublicProfileParams = z.object({
  playerId: z.string().min(1),
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
  overallByPosition: z.partialRecord(FieldPositionSchema, OverallValueSchema),
  bestOverall: OverallValueSchema,
  // `null` only for the zeroed/bootstrap profile (no `overallByPosition`
  // entries yet) — see `public-profile.presenter.ts`.
  bestPosition: FieldPositionSchema.nullable(),
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
  achievements: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string(),
      icon: z.string(),
      unlocked: z.boolean(),
    }),
  ),
});
export type PublicProfileResponse = z.infer<typeof PublicProfileResponse>;
