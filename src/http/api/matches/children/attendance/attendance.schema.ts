import { z } from "zod/v4";

// Shared response shape for confirm/list/cancel — see the company skill's
// ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const AttendanceStatusSchema = z.enum(["confirmed", "waitlisted", "cancelled"]);
export const PaymentStatusSchema = z.enum(["pending", "paid"]);

export const AttendancePlayerResponse = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
});
export type AttendancePlayerResponse = z.infer<typeof AttendancePlayerResponse>;

export const AttendanceResponse = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  status: AttendanceStatusSchema,
  waitlistPos: z.number().int().nullable(),
  paymentStatus: PaymentStatusSchema,
  paidConfirmedById: z.string().nullable(),
  player: AttendancePlayerResponse,
});
export type AttendanceResponse = z.infer<typeof AttendanceResponse>;

// `cancel-presence`'s response: the cancelled row plus whoever got
// auto-promoted (`null` when no one was waitlisted).
export const CancelPresenceResponse = z.object({
  cancelled: AttendanceResponse,
  promoted: AttendanceResponse.nullable(),
});
export type CancelPresenceResponse = z.infer<typeof CancelPresenceResponse>;
