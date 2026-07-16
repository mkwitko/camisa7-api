import { z } from "zod/v4";

export const ConfirmDueParams = z.object({ id: z.uuid() });
export type ConfirmDueParams = z.infer<typeof ConfirmDueParams>;

/**
 * Optional body — omitted (or `{ paid: true }`) confirms payment; `{ paid:
 * false }` is the owner's "dispute"/undo path, flipping the due back to
 * `pending` with `paidConfirmedById: null`. Mirrors
 * `confirm-payment.schema.ts` (attendance) exactly, down to `.nullish()`
 * (not `.optional()`) on the whole object — Fastify/light-my-request parses
 * a bodyless POST as a literal `null`, not `undefined`.
 */
export const ConfirmDueBody = z.object({ paid: z.boolean().default(true) }).nullish();
export type ConfirmDueBody = z.infer<typeof ConfirmDueBody>;
