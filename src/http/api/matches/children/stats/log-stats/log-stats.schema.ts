import { z } from "zod/v4";

export const LogStatsParams = z.object({ id: z.uuid() });
export type LogStatsParams = z.infer<typeof LogStatsParams>;

// Bounded per §brief ("goals 0-50") — guards against fat-finger entries
// (e.g. a stray extra zero) without picking an arbitrarily tight cap.
const MAX_COUNT = 50;

export const LogStatEntry = z.object({
  playerId: z.uuid(),
  team: z.number().int().min(0).optional(),
  goals: z.number().int().min(0).max(MAX_COUNT).default(0),
  assists: z.number().int().min(0).max(MAX_COUNT).default(0),
  ownGoals: z.number().int().min(0).max(MAX_COUNT).default(0),
  cleanSheet: z.boolean().default(false),
});
export type LogStatEntry = z.infer<typeof LogStatEntry>;

export const LogStatsBody = z.object({
  stats: z.array(LogStatEntry).min(1),
});
export type LogStatsBody = z.infer<typeof LogStatsBody>;
