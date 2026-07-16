import { z } from "zod/v4";
import { RecurrenceRuleSchema, SeriesStatusSchema, TimeHHmm } from "../series.schema";

export const UpdateSeriesParams = z.object({
  id: z.uuid(),
});
export type UpdateSeriesParams = z.infer<typeof UpdateSeriesParams>;

/**
 * Fully-partial patch — every field optional, unlike `create-series.schema`'s
 * `CreateSeriesBody` (which requires `rule`/`slots`/etc). No cross-field
 * refine here (e.g. "time required unless manual") since a caller may PATCH
 * just one unrelated field (say `location`) on an existing manual series
 * without resending `rule`/`time` together.
 */
export const UpdateSeriesBody = z.object({
  location: z.string().min(1).optional(),
  priceCents: z.number().int().min(0).optional(),
  slots: z.number().int().min(2).max(64).optional(),
  pixKey: z.string().nullable().optional(),
  time: TimeHHmm.nullable().optional(),
  rule: RecurrenceRuleSchema.optional(),
  status: SeriesStatusSchema.optional(),
  endDate: z.string().nullable().optional(),
});
export type UpdateSeriesBody = z.infer<typeof UpdateSeriesBody>;
