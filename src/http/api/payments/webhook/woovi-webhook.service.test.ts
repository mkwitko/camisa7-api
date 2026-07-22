import { createSign, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionsRepository } from "@/http/api/billing/subscription.repository";
import type { Subscription } from "@/http/api/billing/subscription.types";
import type { DuesRepository } from "@/http/api/dues/dues.repository";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { Payment } from "@/http/api/payments/payments.types";
import type { PaymentsRepository } from "../payments.repository";

// Woovi assina com a chave privada; validamos com a pública. Geramos um par
// só pro teste e injetamos a pública no env — mesma coisa que a chave pública
// real da OpenPix, só que sob nosso controle pra poder assinar os fixtures.
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return { ...actual, env: { ...actual.env, WOOVI_WEBHOOK_PUBLIC_KEY: publicKey } };
});

const { createHandleWooviWebhook } = await import("./woovi-webhook.service");

function sign(body: string): string {
  const signer = createSign("sha256");
  signer.update(body);
  signer.end();
  return signer.sign(privateKey, "base64");
}

function chargeCompletedBody(overrides: { correlationID?: string; status?: string } = {}): string {
  return JSON.stringify({
    event: "OPENPIX:CHARGE_COMPLETED",
    charge: {
      status: overrides.status ?? "COMPLETED",
      correlationID: overrides.correlationID ?? "pay1",
    },
  });
}

function subscriptionEventBody(
  event: string,
  overrides: { correlationID?: string; recurrencyId?: string | null } = {},
): string {
  return JSON.stringify({
    event,
    subscription: {
      correlationID: overrides.correlationID ?? "sub1",
      pixRecurring:
        overrides.recurrencyId !== undefined ? { recurrencyId: overrides.recurrencyId } : undefined,
    },
  });
}

function aPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay1",
    correlationID: "pay1",
    kind: "match_fee",
    status: "pending",
    valueCents: 2000,
    subaccountPixKey: "pix@ex.com",
    brCode: "br-code",
    qrCodeImage: "qr-image",
    paymentLinkUrl: null,
    attendanceId: "att1",
    membershipDueId: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakePaymentsRepo(overrides: Partial<PaymentsRepository> = {}): PaymentsRepository {
  return {
    create: vi.fn(),
    attachCharge: vi.fn(),
    deleteById: vi.fn(),
    findByCorrelationId: vi.fn().mockResolvedValue(null),
    findPendingByAttendance: vi.fn(),
    findPendingByDue: vi.fn(),
    markCompleted: vi.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  } as unknown as PaymentsRepository;
}

function fakeAttendanceRepo(overrides: Partial<AttendanceRepository> = {}): AttendanceRepository {
  return {
    setPayment: vi.fn(),
    ...overrides,
  } as unknown as AttendanceRepository;
}

function fakeDuesRepo(overrides: Partial<DuesRepository> = {}): DuesRepository {
  return {
    setStatus: vi.fn(),
    ...overrides,
  } as unknown as DuesRepository;
}

function aSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub1",
    userId: "user1",
    plan: "player",
    status: "pending",
    wooviCorrelationID: "sub1",
    recurrencyId: null,
    currentPeriodEnd: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeSubscriptionsRepo(
  overrides: Partial<SubscriptionsRepository> = {},
): SubscriptionsRepository {
  return {
    create: vi.fn(),
    findActiveByUser: vi.fn(),
    findByCorrelationId: vi.fn().mockResolvedValue(null),
    findLatestByUser: vi.fn(),
    setStatus: vi.fn(),
    setActive: vi.fn(),
    extendPeriod: vi.fn(),
    ...overrides,
  } as unknown as SubscriptionsRepository;
}

type Deps = Parameters<typeof createHandleWooviWebhook>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    paymentsRepo: fakePaymentsRepo(),
    attendanceRepo: fakeAttendanceRepo(),
    duesRepo: fakeDuesRepo(),
    subscriptionsRepo: fakeSubscriptionsRepo(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createHandleWooviWebhook", () => {
  it("returns ok:false on an invalid signature, without touching any repo", async () => {
    const paymentsRepo = fakePaymentsRepo();
    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo }));
    const rawBody = chargeCompletedBody();

    const result = await handle({ rawBody, signature: "not-the-real-signature" });

    expect(result).toEqual({ ok: false });
    expect(paymentsRepo.findByCorrelationId).not.toHaveBeenCalled();
  });

  it("returns ok:false when the signature header is missing", async () => {
    const handle = createHandleWooviWebhook(buildDeps());
    const result = await handle({ rawBody: chargeCompletedBody(), signature: undefined });
    expect(result).toEqual({ ok: false });
  });

  it("CHARGE_COMPLETED + match_fee: marks completed and the attendance paid", async () => {
    const payment = aPayment({ kind: "match_fee", attendanceId: "att1", membershipDueId: null });
    const paymentsRepo = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(payment),
      markCompleted: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const attendanceRepo = fakeAttendanceRepo();
    const rawBody = chargeCompletedBody({ correlationID: "pay1" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo, attendanceRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.markCompleted).toHaveBeenCalledWith("pay1", expect.any(Date));
    expect(attendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);
  });

  it("CHARGE_COMPLETED + membership_due: marks completed and the due paid", async () => {
    const payment = aPayment({
      kind: "membership_due",
      attendanceId: null,
      membershipDueId: "due1",
    });
    const paymentsRepo = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(payment),
      markCompleted: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const duesRepo = fakeDuesRepo();
    const rawBody = chargeCompletedBody({ correlationID: "pay1" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo, duesRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(duesRepo.setStatus).toHaveBeenCalledWith("due1", "paid", null);
  });

  it("unknown correlationID: no-op, ok:true, markCompleted never called", async () => {
    const paymentsRepo = fakePaymentsRepo({ findByCorrelationId: vi.fn().mockResolvedValue(null) });
    const attendanceRepo = fakeAttendanceRepo();
    const rawBody = chargeCompletedBody({ correlationID: "unknown" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo, attendanceRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.markCompleted).not.toHaveBeenCalled();
    expect(attendanceRepo.setPayment).not.toHaveBeenCalled();
  });

  it("already-completed payment (replay): re-applies the paid effect idempotently — the invariant is that it ends paid, not that the write is skipped", async () => {
    const payment = aPayment({ status: "completed", kind: "match_fee", attendanceId: "att1" });
    const paymentsRepo = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(payment),
      // Already completed → the guarded `updateMany` (`status: "pending"`)
      // matches nothing on a replay.
      markCompleted: vi.fn().mockResolvedValue({ count: 0 }),
    });
    const attendanceRepo = fakeAttendanceRepo();
    const rawBody = chargeCompletedBody({ correlationID: "pay1" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo, attendanceRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.markCompleted).toHaveBeenCalledWith("pay1", expect.any(Date));
    // This is the key behavior change from the old (buggy) version: a
    // replay of a CHARGE_COMPLETED for an already-`completed` Payment must
    // still (re)apply the paid effect — it's idempotent, and re-running it
    // is what recovers a prior delivery that committed `markCompleted` but
    // then crashed before this write (see the partial-failure test below).
    expect(attendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);
  });

  it("concurrent race: markCompleted count 0 (lost the flip) still (re)applies the effect", async () => {
    const payment = aPayment({ status: "pending" });
    const paymentsRepo = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(payment),
      markCompleted: vi.fn().mockResolvedValue({ count: 0 }),
    });
    const attendanceRepo = fakeAttendanceRepo();
    const rawBody = chargeCompletedBody({ correlationID: "pay1" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo, attendanceRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.markCompleted).toHaveBeenCalledWith("pay1", expect.any(Date));
    expect(attendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);
  });

  it("partial-failure recovery: effect throws after markCompleted commits on delivery 1 → delivery 2 still ends the attendance paid", async () => {
    // Delivery 1: the Payment is still "pending" when this delivery is
    // processed. `markCompleted` commits (count: 1) but the effect write
    // then throws (e.g. a transient DB error) — before the fix, this left
    // the attendance stuck "pending" forever, because a retry would see
    // `payment.status === "completed"` and short-circuit before reapplying
    // the effect.
    const pendingPayment = aPayment({
      status: "pending",
      kind: "match_fee",
      attendanceId: "att1",
      membershipDueId: null,
    });
    const failingAttendanceRepo = fakeAttendanceRepo({
      setPayment: vi.fn().mockRejectedValue(new Error("transient failure")),
    });
    const paymentsRepoDelivery1 = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(pendingPayment),
      markCompleted: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const rawBody = chargeCompletedBody({ correlationID: "pay1" });

    const handle1 = createHandleWooviWebhook(
      buildDeps({ paymentsRepo: paymentsRepoDelivery1, attendanceRepo: failingAttendanceRepo }),
    );
    await expect(handle1({ rawBody, signature: sign(rawBody) })).rejects.toThrow(
      "transient failure",
    );
    expect(paymentsRepoDelivery1.markCompleted).toHaveBeenCalledWith("pay1", expect.any(Date));
    expect(failingAttendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);

    // Delivery 2 (Woovi's retry, since delivery 1 never returned a 2xx):
    // `findByCorrelationId` now returns the Payment as "completed" (delivery
    // 1's `markCompleted` did commit before the effect threw). The fixed
    // handler does NOT short-circuit on that — it proceeds, `markCompleted`
    // is a no-op (count: 0), and the effect is reapplied, this time
    // succeeding — recovering the attendance to "paid".
    const completedPayment = aPayment({
      status: "completed",
      kind: "match_fee",
      attendanceId: "att1",
      membershipDueId: null,
    });
    const succeedingAttendanceRepo = fakeAttendanceRepo();
    const paymentsRepoDelivery2 = fakePaymentsRepo({
      findByCorrelationId: vi.fn().mockResolvedValue(completedPayment),
      markCompleted: vi.fn().mockResolvedValue({ count: 0 }),
    });

    const handle2 = createHandleWooviWebhook(
      buildDeps({ paymentsRepo: paymentsRepoDelivery2, attendanceRepo: succeedingAttendanceRepo }),
    );
    const result2 = await handle2({ rawBody, signature: sign(rawBody) });

    expect(result2).toEqual({ ok: true });
    // The invariant proven here: the linked attendance is never left
    // "pending" after a completed Payment — it does end up "paid".
    expect(succeedingAttendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);
  });

  it("ignores events that aren't CHARGE_COMPLETED", async () => {
    const paymentsRepo = fakePaymentsRepo();
    const rawBody = JSON.stringify({
      event: "OPENPIX:CHARGE_CREATED",
      charge: { status: "ACTIVE", correlationID: "pay1" },
    });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.findByCorrelationId).not.toHaveBeenCalled();
  });

  it("ignores CHARGE_COMPLETED events whose charge.status isn't COMPLETED", async () => {
    const paymentsRepo = fakePaymentsRepo();
    const rawBody = chargeCompletedBody({ status: "EXPIRED" });

    const handle = createHandleWooviWebhook(buildDeps({ paymentsRepo }));
    const result = await handle({ rawBody, signature: sign(rawBody) });

    expect(result).toEqual({ ok: true });
    expect(paymentsRepo.findByCorrelationId).not.toHaveBeenCalled();
  });

  describe("PIX Automático subscription lifecycle", () => {
    it("PIX_AUTOMATIC_APPROVED: a pending Subscription becomes active + stores recurrencyId", async () => {
      const sub = aSubscription({ status: "pending" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_APPROVED", {
        correlationID: "sub1",
        recurrencyId: "recur-1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setActive).toHaveBeenCalledWith("sub1", {
        recurrencyId: "recur-1",
      });
    });

    it("PIX_AUTOMATIC_APPROVED replay: an already-active Subscription is left untouched (no-op, stays active)", async () => {
      const sub = aSubscription({ status: "active", recurrencyId: "recur-1" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_APPROVED", {
        correlationID: "sub1",
        recurrencyId: "recur-1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setActive).not.toHaveBeenCalled();
    });

    it("installment-paid event: extends the current period by ~1 month", async () => {
      const sub = aSubscription({ status: "active" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_COBR_COMPLETED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.extendPeriod).toHaveBeenCalledWith("sub1", expect.any(Date));
      const call = vi.mocked(subscriptionsRepo.extendPeriod).mock.calls[0];
      const calledWith = call?.[1] as Date;
      expect(calledWith.getTime()).toBeGreaterThan(Date.now() + 25 * 24 * 60 * 60 * 1000);
    });

    it("EXPIRED event: an active Subscription becomes expired", async () => {
      const sub = aSubscription({ status: "active" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_EXPIRED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("sub1", "expired");
    });

    it("EXPIRED event replay: already-expired Subscription is left untouched (no-op)", async () => {
      const sub = aSubscription({ status: "expired" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_EXPIRED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setStatus).not.toHaveBeenCalled();
    });

    it("cancel/inactive event: an active Subscription becomes canceled", async () => {
      const sub = aSubscription({ status: "active" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_INACTIVATED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setStatus).toHaveBeenCalledWith("sub1", "canceled");
    });

    it("cancel/inactive event replay: already-canceled Subscription is left untouched (no-op)", async () => {
      const sub = aSubscription({ status: "canceled" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_INACTIVATED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setStatus).not.toHaveBeenCalled();
    });

    it("unknown correlationID: no-op, ok:true, no subscriptions-repo write called", async () => {
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(null),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_APPROVED", {
        correlationID: "unknown-sub",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setActive).not.toHaveBeenCalled();
      expect(subscriptionsRepo.setStatus).not.toHaveBeenCalled();
      expect(subscriptionsRepo.extendPeriod).not.toHaveBeenCalled();
    });

    it("unrecognized PIX_AUTOMATIC_* event (e.g. COBR_CREATED, installment scheduled): no-op", async () => {
      const sub = aSubscription({ status: "active" });
      const subscriptionsRepo = fakeSubscriptionsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(sub),
      });
      const rawBody = subscriptionEventBody("OPENPIX:PIX_AUTOMATIC_COBR_CREATED", {
        correlationID: "sub1",
      });

      const handle = createHandleWooviWebhook(buildDeps({ subscriptionsRepo }));
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(subscriptionsRepo.setActive).not.toHaveBeenCalled();
      expect(subscriptionsRepo.setStatus).not.toHaveBeenCalled();
      expect(subscriptionsRepo.extendPeriod).not.toHaveBeenCalled();
    });

    it("CHARGE_COMPLETED (non-subscription) still works unchanged alongside subscription handling", async () => {
      const payment = aPayment({ kind: "match_fee", attendanceId: "att1", membershipDueId: null });
      const paymentsRepo = fakePaymentsRepo({
        findByCorrelationId: vi.fn().mockResolvedValue(payment),
        markCompleted: vi.fn().mockResolvedValue({ count: 1 }),
      });
      const attendanceRepo = fakeAttendanceRepo();
      const subscriptionsRepo = fakeSubscriptionsRepo();
      const rawBody = chargeCompletedBody({ correlationID: "pay1" });

      const handle = createHandleWooviWebhook(
        buildDeps({ paymentsRepo, attendanceRepo, subscriptionsRepo }),
      );
      const result = await handle({ rawBody, signature: sign(rawBody) });

      expect(result).toEqual({ ok: true });
      expect(attendanceRepo.setPayment).toHaveBeenCalledWith("att1", "paid", null);
      expect(subscriptionsRepo.findByCorrelationId).not.toHaveBeenCalled();
    });
  });
});
