import { z } from "zod/v4";

export const PayDueParams = z.object({ id: z.uuid() });
export type PayDueParams = z.infer<typeof PayDueParams>;

/**
 * Mirrors `Payment`'s Woovi-facing fields (`payments.types.ts`), same shape as
 * `pay-attendance.schema.ts`'s `PayAttendanceResponse` — `status` matches the
 * domain `PaymentStatus` union (`pending`/`completed`/`expired`).
 */
export const PayDueResponse = z.object({
  paymentId: z.string(),
  status: z.enum(["pending", "completed", "expired"]),
  brCode: z.string(),
  qrCodeImage: z.string(),
  paymentLinkUrl: z.string().nullable(),
});
export type PayDueResponse = z.infer<typeof PayDueResponse>;
