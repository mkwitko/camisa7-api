import { z } from "zod/v4";
import { BillingModeSchema } from "@/http/api/dues/dues.schema";

// Shared response shape for confirm/list/cancel — see the company skill's
// ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const AttendanceStatusSchema = z.enum(["confirmed", "waitlisted", "cancelled"]);
export const PaymentStatusSchema = z.enum(["pending", "paid"]);

/**
 * DERIVED membership-dues coverage — `list-attendance`-only, see
 * `AttendanceListItem`'s doc comment in `attendance.types.ts` for the
 * `"none"` vs `"paid"`/`"pending"` semantics.
 */
export const MonthlyDueStatusSchema = z.enum(["paid", "pending", "none"]);

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

/**
 * `list-attendance`'s response item: `AttendanceResponse` plus the
 * player's DERIVED group billing context (additive-only, so existing
 * consumers of the plain `AttendanceResponse` shape are unaffected). See
 * `AttendanceListItem` in `attendance.types.ts`.
 */
export const AttendanceListItemResponse = AttendanceResponse.extend({
  billingMode: BillingModeSchema,
  monthlyDueStatus: MonthlyDueStatusSchema,
});
export type AttendanceListItemResponse = z.infer<typeof AttendanceListItemResponse>;

// `cancel-presence`'s response: the cancelled row plus whoever got
// auto-promoted (`null` when no one was waitlisted).
export const CancelPresenceResponse = z.object({
  cancelled: AttendanceResponse,
  promoted: AttendanceResponse.nullable(),
});
export type CancelPresenceResponse = z.infer<typeof CancelPresenceResponse>;
