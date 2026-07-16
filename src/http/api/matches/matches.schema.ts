import { z } from "zod/v4";

// Shared response shape for create/get/list/update/cancel — see the company
// skill's ARCHITECTURE.md §3.5 ("compartilhados do recurso").
export const MatchStatusSchema = z.enum(["open", "full", "closed", "finished", "cancelled"]);

export const MatchResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  seriesId: z.uuid().nullable(),
  detached: z.boolean(),
  datetime: z.string(),
  location: z.string(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  pixKey: z.string().nullable(),
  status: MatchStatusSchema,
  createdAt: z.string(),
});
export type MatchResponse = z.infer<typeof MatchResponse>;
