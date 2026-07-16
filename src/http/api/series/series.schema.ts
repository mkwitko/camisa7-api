import { z } from "zod/v4";

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const weekday = z.number().int().min(0).max(6);

export const RecurrenceRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly"),
    weekdays: z
      .array(weekday)
      .min(1)
      .refine((a) => new Set(a).size === a.length, "weekdays únicos"),
    interval: z.number().int().min(1),
  }),
  z.object({ kind: z.literal("monthly_dom"), day: z.number().int().min(1).max(31) }),
  z.object({
    kind: z.literal("monthly_nth"),
    week: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
    weekday,
  }),
  z.object({ kind: z.literal("manual") }),
]);
export type RecurrenceRuleSchema = z.infer<typeof RecurrenceRuleSchema>;

export const SeriesStatusSchema = z.enum(["active", "paused", "ended"]);

export const SeriesResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  rule: RecurrenceRuleSchema,
  time: z.string().nullable(),
  location: z.string(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  pixKey: z.string().nullable(),
  status: SeriesStatusSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
});
export type SeriesResponse = z.infer<typeof SeriesResponse>;

/** Body de horário/regra reusável — `time` obrigatório salvo `manual`. */
export const TimeHHmm = z.string().regex(TIME_HHMM, "Expected HH:mm");
