import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { PaymentsRepository } from "@/http/api/payments/payments.repository";
import type { Payment } from "@/http/api/payments/payments.types";
import type { DuesRepository } from "../dues.repository";
import type { MembershipDue } from "../dues.types";

// `isWooviConfigured`/`createCharge` are module-level exports (not injected
// deps), so they're mocked at the module boundary — same pattern
// `pay-attendance.service.test.ts` uses.
const h = vi.hoisted(() => ({
  wooviConfigured: true,
  createCharge: vi.fn(),
}));

vi.mock("@/infra/woovi/client", () => ({
  get isWooviConfigured() {
    return h.wooviConfigured;
  },
  createCharge: h.createCharge,
}));

const { createPayDueService } = await import("./pay-due.service");

const SELF_USER = "user-self";
const OTHER_USER = "user-other";

const aDue = (overrides: Partial<MembershipDue> = {}): MembershipDue => ({
  id: "due1",
  groupMemberId: "gm1",
  competencyMonth: "2026-07",
  amountCents: 5000,
  status: "pending",
  paidConfirmedById: null,
  provider: "manual",
  externalRef: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: "user-owner",
  statsMode: "organizador",
  monthlyFeeCents: 5000,
  isPublic: false,
  joinPolicy: "open",
  wooviPixKey: "pix@ex.com",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "pay1",
  correlationID: "pay1",
  kind: "membership_due",
  status: "pending",
  valueCents: 5000,
  subaccountPixKey: "pix@ex.com",
  brCode: "",
  qrCodeImage: "",
  paymentLinkUrl: null,
  attendanceId: null,
  membershipDueId: "due1",
  paidAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

type FoundDue = { due: MembershipDue; groupId: string; playerUserId: string | null };

const aFoundDue = (overrides: Partial<FoundDue> = {}): FoundDue => ({
  due: aDue(),
  groupId: "g1",
  playerUserId: SELF_USER,
  ...overrides,
});

function fakeDuesRepo(found: FoundDue | null): DuesRepository {
  return { findByIdWithMember: vi.fn().mockResolvedValue(found) } as unknown as DuesRepository;
}

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return { findById: vi.fn().mockResolvedValue(group) } as unknown as GroupsRepository;
}

function fakePaymentsRepo(overrides: Partial<PaymentsRepository> = {}): PaymentsRepository {
  return {
    create: vi.fn().mockResolvedValue(aPayment()),
    attachCharge: vi.fn().mockImplementation(async (_id, charge) => aPayment({ ...charge })),
    deleteById: vi.fn().mockResolvedValue(undefined),
    findPendingByAttendance: vi.fn(),
    findPendingByDue: vi.fn().mockResolvedValue(null),
    findByCorrelationId: vi.fn(),
    markCompleted: vi.fn(),
    ...overrides,
  } as unknown as PaymentsRepository;
}

type Deps = Parameters<typeof createPayDueService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    duesRepo: fakeDuesRepo(aFoundDue()),
    groupsRepo: fakeGroupsRepo(aGroup()),
    paymentsRepo: fakePaymentsRepo(),
    ...over,
  };
}

beforeEach(() => {
  h.wooviConfigured = true;
  h.createCharge.mockReset().mockResolvedValue({
    brCode: "br-code-xyz",
    qrCodeImage: "https://qr.example/img.png",
    paymentLinkUrl: "https://pay.example/link",
  });
});

describe("createPayDueService", () => {
  it("happy path: creates a Payment, calls createCharge and attaches the charge", async () => {
    const paymentsRepo = fakePaymentsRepo();
    const service = createPayDueService(buildDeps({ paymentsRepo }));

    const result = await service("due1", SELF_USER);

    expect(paymentsRepo.create).toHaveBeenCalledWith({
      kind: "membership_due",
      valueCents: 5000,
      subaccountPixKey: "pix@ex.com",
      membershipDueId: "due1",
    });
    expect(h.createCharge).toHaveBeenCalledWith({
      correlationID: "pay1",
      value: 5000,
      subaccount: "pix@ex.com",
      comment: "Mensalidade Team A",
    });
    expect(paymentsRepo.attachCharge).toHaveBeenCalledWith("pay1", {
      brCode: "br-code-xyz",
      qrCodeImage: "https://qr.example/img.png",
      paymentLinkUrl: "https://pay.example/link",
    });
    expect(result).toEqual({
      paymentId: "pay1",
      status: "pending",
      brCode: "br-code-xyz",
      qrCodeImage: "https://qr.example/img.png",
      paymentLinkUrl: "https://pay.example/link",
    });
  });

  it("idempotent: reuses an existing pending Payment without calling createCharge again", async () => {
    const paymentsRepo = fakePaymentsRepo({
      findPendingByDue: vi.fn().mockResolvedValue(
        aPayment({
          id: "pay-existing",
          correlationID: "pay-existing",
          brCode: "already-brcode",
          qrCodeImage: "already-qr",
          paymentLinkUrl: "already-link",
        }),
      ),
    });
    const service = createPayDueService(buildDeps({ paymentsRepo }));

    const result = await service("due1", SELF_USER);

    expect(h.createCharge).not.toHaveBeenCalled();
    expect(paymentsRepo.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      paymentId: "pay-existing",
      status: "pending",
      brCode: "already-brcode",
      qrCodeImage: "already-qr",
      paymentLinkUrl: "already-link",
    });
  });

  it("rejects with WOO-T0001 (503) when Woovi isn't configured", async () => {
    h.wooviConfigured = false;
    const service = createPayDueService(buildDeps());

    await expect(service("due1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0001",
      statusCode: 503,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with DUE-T0001 (404) when the due doesn't exist", async () => {
    const service = createPayDueService(buildDeps({ duesRepo: fakeDuesRepo(null) }));

    await expect(service("due1", SELF_USER)).rejects.toMatchObject({
      code: "DUE-T0001",
      statusCode: 404,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with DUE-T0002 (403) when the due belongs to another user", async () => {
    const service = createPayDueService(buildDeps());

    await expect(service("due1", OTHER_USER)).rejects.toMatchObject({
      code: "DUE-T0002",
      statusCode: 403,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with WOO-T0003 (409) when the due isn't pending", async () => {
    const service = createPayDueService(
      buildDeps({ duesRepo: fakeDuesRepo(aFoundDue({ due: aDue({ status: "paid" }) })) }),
    );

    await expect(service("due1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0003",
      statusCode: 409,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with WOO-T0002 (409) when the group has no Woovi subaccount", async () => {
    const service = createPayDueService(
      buildDeps({ groupsRepo: fakeGroupsRepo(aGroup({ wooviPixKey: null })) }),
    );

    await expect(service("due1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0002",
      statusCode: 409,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("deletes the just-created Payment and rethrows when createCharge fails, leaving nothing to reuse", async () => {
    const wooviError = new Error("Woovi is down");
    h.createCharge.mockReset().mockRejectedValue(wooviError);
    const paymentsRepo = fakePaymentsRepo({
      create: vi
        .fn()
        .mockResolvedValue(aPayment({ id: "pay-broken", correlationID: "pay-broken" })),
    });
    const service = createPayDueService(buildDeps({ paymentsRepo }));

    await expect(service("due1", SELF_USER)).rejects.toThrow(wooviError);

    expect(paymentsRepo.deleteById).toHaveBeenCalledWith("pay-broken");
    expect(paymentsRepo.attachCharge).not.toHaveBeenCalled();
  });
});
