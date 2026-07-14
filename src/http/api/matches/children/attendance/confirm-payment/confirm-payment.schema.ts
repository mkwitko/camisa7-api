import { z } from "zod/v4";

export const ConfirmPaymentParams = z.object({ id: z.uuid(), attId: z.uuid() });
export type ConfirmPaymentParams = z.infer<typeof ConfirmPaymentParams>;

/**
 * Optional body — omitted (or `{ paid: true }`) confirms payment; `{ paid:
 * false }` is the owner's "dispute"/undo path, flipping the attendance back
 * to `pending` with `paidConfirmedById: null`. Keeping this a toggle on the
 * same endpoint (rather than a separate `unconfirm-payment` route) per the
 * brief's "keep it simple" instruction. The whole object is `.nullish()`
 * (not just `paid`) so a request with no body at all — the common case —
 * validates: Fastify/light-my-request parses a bodyless POST as a literal
 * `null` (not `undefined`), hence `nullish()` over `optional()`. The
 * controller falls back to `paid: true` when `req.body` is nullish.
 */
export const ConfirmPaymentBody = z.object({ paid: z.boolean().default(true) }).nullish();
export type ConfirmPaymentBody = z.infer<typeof ConfirmPaymentBody>;
