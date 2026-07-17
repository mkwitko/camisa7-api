import { z } from "zod/v4";
import {
  AffinityValueSchema,
  FieldPositionSchema,
} from "@/http/api/groups/children/members/members.schema";

// Shared response shape for `get-career` (and any future career-mutating
// endpoint) — see ARCHITECTURE.md §3.5 ("compartilhados do recurso").
export const PlayerLevelSchema = z.enum(["bronze", "prata", "ouro"]);

/** Same 0-99 bound `GroupMember.seedOverall` uses (`SeedOverallValueSchema` in `members.schema.ts`) — `PlayerCareer.overall` is the same scale. */
export const OverallValueSchema = z.number().int().min(0).max(99);

export const PlayerCareerResponse = z.object({
  // `null` when the player has no `PlayerCareer` row yet (no finalized match
  // has ever recomputed one for them) — `get-career` still returns 200 with
  // a zeroed/bootstrap-default body rather than 404, see
  // `get-career.service.ts`.
  id: z.uuid().nullable(),
  playerId: z.uuid(),
  overall: z.partialRecord(FieldPositionSchema, OverallValueSchema),
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema),
  level: PlayerLevelSchema,
  matchesPlayed: z.number().int().min(0),
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
  goals: z.number().int().min(0),
  assists: z.number().int().min(0),
  cleanSheets: z.number().int().min(0),
  mvpCount: z.number().int().min(0),
  currentStreak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  updatedAt: z.string().nullable(),
});
export type PlayerCareerResponse = z.infer<typeof PlayerCareerResponse>;
