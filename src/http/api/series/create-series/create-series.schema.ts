import { z } from "zod/v4";
import { RecurrenceRuleSchema, TimeHHmm } from "../series.schema";

export const CreateSeriesParams = z.object({
  id: z.uuid(),
});
export type CreateSeriesParams = z.infer<typeof CreateSeriesParams>;

export const CreateSeriesBody = z
  .object({
    rule: RecurrenceRuleSchema,
    time: TimeHHmm.nullable(),
    location: z.string().min(1),
    priceCents: z.number().int().min(0).optional(),
    slots: z.number().int().min(2).max(64),
    pixKey: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
  })
  .refine((b) => b.rule.kind === "manual" || b.time !== null, "time obrigatório salvo manual");
export type CreateSeriesBody = z.infer<typeof CreateSeriesBody>;
