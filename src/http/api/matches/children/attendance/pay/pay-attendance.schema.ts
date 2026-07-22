import { z } from "zod/v4";

export const PayAttendanceParams = z.object({ id: z.uuid(), attId: z.uuid() });
export type PayAttendanceParams = z.infer<typeof PayAttendanceParams>;

/**
 * Mirrors `Payment`'s Woovi-facing fields (`payments.types.ts`) — `status`
 * matches the domain `PaymentStatus` union (`pending`/`completed`/`expired`),
 * not `Attendance.paymentStatus`'s older `pending`/`paid` pair.
 */
export const PayAttendanceResponse = z.object({
  paymentId: z.string(),
  status: z.enum(["pending", "completed", "expired"]),
  brCode: z.string(),
  qrCodeImage: z.string(),
  paymentLinkUrl: z.string().nullable(),
});
export type PayAttendanceResponse = z.infer<typeof PayAttendanceResponse>;
