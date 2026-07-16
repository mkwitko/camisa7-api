import { z } from "zod/v4";

export const ListGroupDuesParams = z.object({ groupId: z.uuid() });
export type ListGroupDuesParams = z.infer<typeof ListGroupDuesParams>;

/**
 * `month` ("YYYY-MM") is optional — the controller defaults it to the
 * current competency month (`competencyMonth(new Date())`, injected `now`)
 * when omitted, mirroring `confirm-payment.schema.ts`'s "the client usually
 * omits it" shape.
 */
export const ListGroupDuesQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM")
    .optional(),
});
export type ListGroupDuesQuery = z.infer<typeof ListGroupDuesQuery>;
