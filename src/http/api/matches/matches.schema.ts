import { z } from "zod/v4";

// Shared response shape for create/get/list/update/cancel — see the company
// skill's ARCHITECTURE.md §3.5 ("compartilhados do recurso").
export const MatchStatusSchema = z.enum(["open", "full", "closed", "finished", "cancelled"]);

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `null` = one-off match. `weekday` 0 (Sunday) .. 6 (Saturday), `time` "HH:mm". */
export const RecurrenceRuleSchema = z
  .object({
    weekly: z.literal(true),
    weekday: z.number().int().min(0).max(6),
    time: z.string().regex(TIME_HHMM, "Expected HH:mm"),
  })
  .nullable();
export type RecurrenceRuleSchema = z.infer<typeof RecurrenceRuleSchema>;

export const MatchResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  datetime: z.string(),
  location: z.string(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  pixKey: z.string().nullable(),
  status: MatchStatusSchema,
  recurrenceRule: RecurrenceRuleSchema,
  createdAt: z.string(),
});
export type MatchResponse = z.infer<typeof MatchResponse>;
