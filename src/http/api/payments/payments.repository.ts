import { randomUUID } from "node:crypto";
import type { PrismaLike } from "@/infra/db/client";
import type { Payment, PaymentKind, PaymentStatus } from "./payments.types";

type PaymentRow = {
  id: string;
  correlationID: string;
  kind: string;
  status: string;
  valueCents: number;
  subaccountPixKey: string;
  brCode: string;
  qrCodeImage: string;
  paymentLinkUrl: string | null;
  attendanceId: string | null;
  membershipDueId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomainPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    correlationID: row.correlationID,
    kind: row.kind as PaymentKind,
    status: row.status as PaymentStatus,
    valueCents: row.valueCents,
    subaccountPixKey: row.subaccountPixKey,
    brCode: row.brCode,
    qrCodeImage: row.qrCodeImage,
    paymentLinkUrl: row.paymentLinkUrl,
    attendanceId: row.attendanceId,
    membershipDueId: row.membershipDueId,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `create`'s input — exactly one of `attendanceId`/`membershipDueId` should
 * be set (the caller's `PaymentKind` choice, `pay-attendance`/`pay-due`),
 * though this repository doesn't itself enforce the XOR (no DB constraint
 * can express it either — see the `Payment` model's doc comment). `brCode`/
 * `qrCodeImage`/`paymentLinkUrl` are never accepted here — the row is
 * inserted before the Woovi API call returns, filled in later via
 * `attachCharge`.
 */
export type CreatePaymentInput = {
  kind: PaymentKind;
  valueCents: number;
  subaccountPixKey: string;
  attendanceId?: string | null | undefined;
  membershipDueId?: string | null | undefined;
};

export type AttachChargeInput = {
  brCode: string;
  qrCodeImage: string;
  paymentLinkUrl?: string | null | undefined;
};

export interface PaymentsRepository {
  /**
   * Inserts a new `Payment` with `correlationID` set equal to its own `id` —
   * both minted here (`randomUUID()`, not the DB's `@default(uuid())`) so
   * the caller can hand `correlationID` to Woovi's `createCharge` in the
   * same call that creates the row. `brCode`/`qrCodeImage` start as empty
   * strings, `paymentLinkUrl` as `null` — `attachCharge` fills them in once
   * the Woovi API responds.
   */
  create(input: CreatePaymentInput): Promise<Payment>;
  /** Fills in the charge details once Woovi's `createCharge` responds. */
  attachCharge(id: string, charge: AttachChargeInput): Promise<Payment>;
  findByCorrelationId(correlationID: string): Promise<Payment | null>;
  /** The live (`pending`) charge for an attendance, if any — feeds `pay-attendance`'s idempotency (reuse instead of minting a duplicate). */
  findPendingByAttendance(attendanceId: string): Promise<Payment | null>;
  /** The live (`pending`) charge for a due, if any — feeds `pay-due`'s idempotency. */
  findPendingByDue(membershipDueId: string): Promise<Payment | null>;
  /**
   * Marks the `Payment` identified by `correlationID` as `completed` +
   * `paidAt`, but ONLY if it's still `pending` (the `updateMany` `where`
   * guards on `status: "pending"`) — the webhook handler's idempotency:
   * reprocessing the same `CHARGE_COMPLETED` delivery a 2nd time matches
   * zero rows (already `completed`) and returns `count: 0`, a no-op rather
   * than an error. Returns the raw `count` so the caller can tell "just
   * completed it" (1) from "already processed" (0).
   */
  markCompleted(correlationID: string, paidAt: Date): Promise<{ count: number }>;
}

/** Factory `createPaymentsRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createPaymentsRepository(db: PrismaLike): PaymentsRepository {
  return {
    async create(input) {
      const id = randomUUID();
      const row = await db.payment.create({
        data: {
          id,
          correlationID: id,
          kind: input.kind,
          status: "pending",
          valueCents: input.valueCents,
          subaccountPixKey: input.subaccountPixKey,
          brCode: "",
          qrCodeImage: "",
          paymentLinkUrl: null,
          attendanceId: input.attendanceId ?? null,
          membershipDueId: input.membershipDueId ?? null,
        },
      });
      return toDomainPayment(row);
    },

    async attachCharge(id, charge) {
      const row = await db.payment.update({
        where: { id },
        data: {
          brCode: charge.brCode,
          qrCodeImage: charge.qrCodeImage,
          paymentLinkUrl: charge.paymentLinkUrl ?? null,
        },
      });
      return toDomainPayment(row);
    },

    async findByCorrelationId(correlationID) {
      const row = await db.payment.findUnique({ where: { correlationID } });
      return row ? toDomainPayment(row) : null;
    },

    async findPendingByAttendance(attendanceId) {
      const row = await db.payment.findFirst({
        where: { attendanceId, status: "pending" },
        orderBy: { createdAt: "desc" },
      });
      return row ? toDomainPayment(row) : null;
    },

    async findPendingByDue(membershipDueId) {
      const row = await db.payment.findFirst({
        where: { membershipDueId, status: "pending" },
        orderBy: { createdAt: "desc" },
      });
      return row ? toDomainPayment(row) : null;
    },

    async markCompleted(correlationID, paidAt) {
      const { count } = await db.payment.updateMany({
        where: { correlationID, status: "pending" },
        data: { status: "completed", paidAt },
      });
      return { count };
    },
  };
}
