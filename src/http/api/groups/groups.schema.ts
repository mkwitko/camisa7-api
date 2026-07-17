import { z } from "zod/v4";

// Shared response shape for create/list/get — see ARCHITECTURE.md §3.5
// ("compartilhados do recurso").
export const GroupStatsModeSchema = z.enum(["organizador", "colaborativo"]);

/** Geo G3: how strangers join a public group's matches. */
export const JoinPolicySchema = z.enum(["open", "request"]);

export const GroupResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  ownerId: z.string(),
  statsMode: GroupStatsModeSchema,
  monthlyFeeCents: z.number().int().nullable(),
  isPublic: z.boolean(),
  joinPolicy: JoinPolicySchema,
  createdAt: z.string(),
});
export type GroupResponse = z.infer<typeof GroupResponse>;
