import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { PaymentsRepository } from "@/http/api/payments/payments.repository";
import type { Payment } from "@/http/api/payments/payments.types";
import type { Player } from "@/http/api/players/players.types";
import type { MatchesRepository } from "../../../matches.repository";
import type { Match } from "../../../matches.types";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

// `isWooviConfigured`/`createCharge` are module-level exports (not injected
// deps), so they're mocked at the module boundary — same pattern
// `create-subaccount.service.test.ts` uses.
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

const { createPayAttendanceService } = await import("./pay-attendance.service");

const SELF_USER = "user-self";
const OTHER_USER = "user-other";

const aMatch = (overrides: Partial<Match> = {}): Match =>
  ({
    id: "m1",
    groupId: "g1",
    seriesId: null,
    detached: false,
    datetime: new Date("2026-08-01T20:00:00.000Z").toISOString(),
    location: "Quadra",
    priceCents: 2000,
    slots: 10,
    pixKey: null,
    status: "open",
    modality: "campo",
    latitude: null,
    longitude: null,
    city: null,
    address: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as Match;

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: "user-owner",
  statsMode: "organizador",
  monthlyFeeCents: null,
  isPublic: false,
  joinPolicy: "open",
  wooviPixKey: "pix@ex.com",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: SELF_USER,
  name: "Player",
  slug: "player-0001",
  phone: null,
  avatarUrl: null,
  affinity: {},
  attributes: {},
  skills: [],
  dominantFoot: null,
  weakFoot: null,
  skillMoves: null,
  heightCm: null,
  weightKg: null,
  birthYear: null,
  preferredTeam: null,
  nationality: null,
  ...overrides,
});

const anAttendance = (overrides: Partial<Attendance> = {}): Attendance => ({
  id: "att1",
  matchId: "m1",
  player: aPlayer(),
  status: "confirmed",
  waitlistPos: null,
  paymentStatus: "pending",
  paidConfirmedById: null,
  ...overrides,
});

const aPayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "pay1",
  correlationID: "pay1",
  kind: "match_fee",
  status: "pending",
  valueCents: 2000,
  subaccountPixKey: "pix@ex.com",
  brCode: "",
  qrCodeImage: "",
  paymentLinkUrl: null,
  attendanceId: "att1",
  membershipDueId: null,
  paidAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function fakeMatchesRepo(match: Match | null): MatchesRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchesRepository;
}

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return { findById: vi.fn().mockResolvedValue(group) } as unknown as GroupsRepository;
}

function fakeAttendanceRepo(attendance: Attendance | null): AttendanceRepository {
  return { findById: vi.fn().mockResolvedValue(attendance) } as unknown as AttendanceRepository;
}

function fakePaymentsRepo(overrides: Partial<PaymentsRepository> = {}): PaymentsRepository {
  return {
    create: vi.fn().mockResolvedValue(aPayment()),
    attachCharge: vi.fn().mockImplementation(async (_id, charge) => aPayment({ ...charge })),
    deleteById: vi.fn().mockResolvedValue(undefined),
    findPendingByAttendance: vi.fn().mockResolvedValue(null),
    findByCorrelationId: vi.fn(),
    findPendingByDue: vi.fn(),
    markCompleted: vi.fn(),
    ...overrides,
  } as unknown as PaymentsRepository;
}

type Deps = Parameters<typeof createPayAttendanceService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    matchesRepo: fakeMatchesRepo(aMatch()),
    groupsRepo: fakeGroupsRepo(aGroup()),
    attendanceRepo: fakeAttendanceRepo(anAttendance()),
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

describe("createPayAttendanceService", () => {
  it("happy path: creates a Payment, calls createCharge and attaches the charge", async () => {
    const paymentsRepo = fakePaymentsRepo();
    const service = createPayAttendanceService(buildDeps({ paymentsRepo }));

    const result = await service("m1", "att1", SELF_USER);

    expect(paymentsRepo.create).toHaveBeenCalledWith({
      kind: "match_fee",
      valueCents: 2000,
      subaccountPixKey: "pix@ex.com",
      attendanceId: "att1",
    });
    expect(h.createCharge).toHaveBeenCalledWith({
      correlationID: "pay1",
      value: 2000,
      subaccount: "pix@ex.com",
      comment: "Pelada Team A",
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
      findPendingByAttendance: vi.fn().mockResolvedValue(
        aPayment({
          id: "pay-existing",
          correlationID: "pay-existing",
          brCode: "already-brcode",
          qrCodeImage: "already-qr",
          paymentLinkUrl: "already-link",
        }),
      ),
    });
    const service = createPayAttendanceService(buildDeps({ paymentsRepo }));

    const result = await service("m1", "att1", SELF_USER);

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
    const service = createPayAttendanceService(buildDeps());

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0001",
      statusCode: 503,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with MTC-T0001 (404) when the match doesn't exist", async () => {
    const service = createPayAttendanceService(buildDeps({ matchesRepo: fakeMatchesRepo(null) }));

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "MTC-T0001",
      statusCode: 404,
    });
  });

  it("rejects with WOO-T0003 (409) when the match is free (priceCents = 0)", async () => {
    const service = createPayAttendanceService(
      buildDeps({ matchesRepo: fakeMatchesRepo(aMatch({ priceCents: 0 })) }),
    );

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0003",
      statusCode: 409,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with WOO-T0003 (409) when the attendance isn't confirmed", async () => {
    const service = createPayAttendanceService(
      buildDeps({
        attendanceRepo: fakeAttendanceRepo(anAttendance({ status: "waitlisted" })),
      }),
    );

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0003",
      statusCode: 409,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with WOO-T0002 (409) when the group has no Woovi subaccount", async () => {
    const service = createPayAttendanceService(
      buildDeps({ groupsRepo: fakeGroupsRepo(aGroup({ wooviPixKey: null })) }),
    );

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "WOO-T0002",
      statusCode: 409,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with ATT-T0003 (403) when the attendance belongs to another user", async () => {
    const service = createPayAttendanceService(buildDeps());

    await expect(service("m1", "att1", OTHER_USER)).rejects.toMatchObject({
      code: "ATT-T0003",
      statusCode: 403,
    });
    expect(h.createCharge).not.toHaveBeenCalled();
  });

  it("rejects with ATT-T0002 (404) when the attendance doesn't exist in this match", async () => {
    const service = createPayAttendanceService(
      buildDeps({ attendanceRepo: fakeAttendanceRepo(null) }),
    );

    await expect(service("m1", "att1", SELF_USER)).rejects.toMatchObject({
      code: "ATT-T0002",
      statusCode: 404,
    });
  });

  it("deletes the just-created Payment and rethrows when createCharge fails, leaving nothing to reuse", async () => {
    const wooviError = new Error("Woovi is down");
    h.createCharge.mockReset().mockRejectedValue(wooviError);
    const paymentsRepo = fakePaymentsRepo({
      create: vi
        .fn()
        .mockResolvedValue(aPayment({ id: "pay-broken", correlationID: "pay-broken" })),
    });
    const service = createPayAttendanceService(buildDeps({ paymentsRepo }));

    await expect(service("m1", "att1", SELF_USER)).rejects.toThrow(wooviError);

    expect(paymentsRepo.deleteById).toHaveBeenCalledWith("pay-broken");
    expect(paymentsRepo.attachCharge).not.toHaveBeenCalled();
  });
});
