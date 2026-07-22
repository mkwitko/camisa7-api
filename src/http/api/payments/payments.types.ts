/**
 * Domain `PaymentKind` — mirrors the Prisma `PaymentKind` enum values as a
 * plain string union (same rationale as `MatchStatus`/`DueStatus` elsewhere:
 * callers don't depend on the generated Prisma client's types). What a
 * `Payment` charges for: a `Match` attendee's per-match fee (`match_fee`,
 * `Payment.attendanceId` set) or a mensalista's monthly due
 * (`membership_due`, `Payment.membershipDueId` set).
 */
export type PaymentKind = "match_fee" | "membership_due";

/**
 * Domain `PaymentStatus` — mirrors the Prisma `WooviPaymentStatus` enum
 * values (renamed at the Prisma level to avoid colliding with the
 * pre-existing `PaymentStatus` enum on `Attendance.paymentStatus`, a
 * different/older `pending`/`paid` state machine — see the `Payment` model's
 * doc comment in `schema.prisma`). `pending` from creation (charge minted at
 * Woovi); `completed` once the `CHARGE_COMPLETED` webhook confirms it
 * (`markCompleted`); `expired` is reserved for a future TTL/cleanup job.
 */
export type PaymentStatus = "pending" | "completed" | "expired";

/**
 * Domain `Payment` — not the Prisma row. One Woovi PIX charge, correlated
 * 1:1 to either a `Match` attendee's fee (`attendanceId`) or a mensalista's
 * `MembershipDue` (`membershipDueId`) — exactly one of the two is set.
 * `correlationID` equals `id` (sent to Woovi at charge creation, comes back
 * unchanged on the webhook) and is the idempotency key `markCompleted`
 * relies on. `brCode`/`qrCodeImage` start empty right after `create` (the
 * row exists before the Woovi API call returns) and are filled in by
 * `attachCharge` once the charge comes back from Woovi.
 */
export type Payment = {
  id: string;
  correlationID: string;
  kind: PaymentKind;
  status: PaymentStatus;
  valueCents: number;
  subaccountPixKey: string;
  brCode: string;
  qrCodeImage: string;
  paymentLinkUrl: string | null;
  attendanceId: string | null;
  membershipDueId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};
