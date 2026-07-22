import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { generateSlug, randomHex4 } from "@/http/api/players/player-slug";
import { buildGroupInput, createOwner } from "../../../../test/builders/group.builder";
import { startTestDb, type TestDb } from "../../../../test/integration/helpers/db";
import { createPaymentsRepository, type PaymentsRepository } from "./payments.repository";

describe("paymentsRepository (integration)", () => {
  let testDb: TestDb;
  let repo: PaymentsRepository;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createPaymentsRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Payment", "MembershipDue", "GroupMember", "Attendance", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  async function createGroupId(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    return group.id;
  }

  async function createPlayerId(name = "Player"): Promise<string> {
    const player = await testDb.prisma.player.create({
      data: { name, slug: generateSlug(name, randomHex4) },
    });
    return player.id;
  }

  /** Seeds a `confirmed` Attendance (via a real Match) to use as a `Payment.attendanceId` FK target. */
  async function seedAttendanceId(groupId: string): Promise<string> {
    const match = await matchesRepo.insert({
      groupId,
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 1000,
      slots: 10,
    });
    const playerId = await createPlayerId();
    const attendance = await testDb.prisma.attendance.create({
      data: { matchId: match.id, playerId, status: "confirmed" },
    });
    return attendance.id;
  }

  /** Seeds a `pending` MembershipDue (via a `mensalista` GroupMember) to use as a `Payment.membershipDueId` FK target. */
  async function seedDueId(groupId: string): Promise<string> {
    const playerId = await createPlayerId();
    const groupMember = await testDb.prisma.groupMember.create({
      data: { groupId, playerId, role: "jogador", billingMode: "mensalista" },
    });
    const due = await testDb.prisma.membershipDue.create({
      data: {
        groupMemberId: groupMember.id,
        competencyMonth: "2026-07",
        amountCents: 5000,
        status: "pending",
        provider: "manual",
      },
    });
    return due.id;
  }

  describe("create", () => {
    it("inserts a pending Payment with correlationID equal to id, and blank charge fields", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);

      const payment = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });

      expect(payment.id).toBe(payment.correlationID);
      expect(payment.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(payment).toMatchObject({
        kind: "match_fee",
        status: "pending",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        brCode: "",
        qrCodeImage: "",
        paymentLinkUrl: null,
        attendanceId,
        membershipDueId: null,
        paidAt: null,
      });
    });

    it("accepts a membershipDueId instead of an attendanceId", async () => {
      const groupId = await createGroupId();
      const dueId = await seedDueId(groupId);

      const payment = await repo.create({
        kind: "membership_due",
        valueCents: 5000,
        subaccountPixKey: "organizer@pix.com",
        membershipDueId: dueId,
      });

      expect(payment.kind).toBe("membership_due");
      expect(payment.attendanceId).toBeNull();
      expect(payment.membershipDueId).toBe(dueId);
    });
  });

  describe("findByCorrelationId", () => {
    it("round-trips a created Payment by its correlationID", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);
      const created = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });

      const found = await repo.findByCorrelationId(created.correlationID);

      expect(found).toEqual(created);
    });

    it("returns null for an unknown correlationID", async () => {
      await expect(
        repo.findByCorrelationId("00000000-0000-0000-0000-000000000000"),
      ).resolves.toBeNull();
    });
  });

  describe("attachCharge", () => {
    it("fills in brCode/qrCodeImage/paymentLinkUrl once Woovi's charge responds", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);
      const created = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });

      const attached = await repo.attachCharge(created.id, {
        brCode: "00020126...copiaecola",
        qrCodeImage: "https://api.woovi.com/qr/abc.png",
        paymentLinkUrl: "https://woovi.com/pay/abc",
      });

      expect(attached).toMatchObject({
        brCode: "00020126...copiaecola",
        qrCodeImage: "https://api.woovi.com/qr/abc.png",
        paymentLinkUrl: "https://woovi.com/pay/abc",
      });
      const reFound = await repo.findByCorrelationId(created.correlationID);
      expect(reFound).toMatchObject({
        brCode: "00020126...copiaecola",
        qrCodeImage: "https://api.woovi.com/qr/abc.png",
        paymentLinkUrl: "https://woovi.com/pay/abc",
      });
    });

    it("defaults paymentLinkUrl to null when Woovi doesn't return one", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);
      const created = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });

      const attached = await repo.attachCharge(created.id, {
        brCode: "00020126...copiaecola",
        qrCodeImage: "https://api.woovi.com/qr/abc.png",
      });

      expect(attached.paymentLinkUrl).toBeNull();
    });
  });

  describe("findPendingByAttendance / findPendingByDue", () => {
    it("returns only the pending Payment for an attendance, ignoring completed ones", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);

      const completed = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });
      await repo.markCompleted(completed.correlationID, new Date());

      const pending = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });

      const found = await repo.findPendingByAttendance(attendanceId);
      expect(found?.id).toBe(pending.id);
      expect(found?.status).toBe("pending");
    });

    it("returns null when the attendance has no pending Payment", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);

      await expect(repo.findPendingByAttendance(attendanceId)).resolves.toBeNull();
    });

    it("returns only the pending Payment for a due, ignoring completed ones", async () => {
      const groupId = await createGroupId();
      const dueId = await seedDueId(groupId);

      const completed = await repo.create({
        kind: "membership_due",
        valueCents: 5000,
        subaccountPixKey: "organizer@pix.com",
        membershipDueId: dueId,
      });
      await repo.markCompleted(completed.correlationID, new Date());

      const pending = await repo.create({
        kind: "membership_due",
        valueCents: 5000,
        subaccountPixKey: "organizer@pix.com",
        membershipDueId: dueId,
      });

      const found = await repo.findPendingByDue(dueId);
      expect(found?.id).toBe(pending.id);
      expect(found?.status).toBe("pending");
    });

    it("returns null when the due has no pending Payment", async () => {
      const groupId = await createGroupId();
      const dueId = await seedDueId(groupId);

      await expect(repo.findPendingByDue(dueId)).resolves.toBeNull();
    });
  });

  describe("markCompleted", () => {
    it("marks a pending Payment completed with paidAt, and is idempotent on replay", async () => {
      const groupId = await createGroupId();
      const attendanceId = await seedAttendanceId(groupId);
      const created = await repo.create({
        kind: "match_fee",
        valueCents: 1000,
        subaccountPixKey: "organizer@pix.com",
        attendanceId,
      });
      const paidAt = new Date("2026-08-01T20:05:00.000Z");

      const first = await repo.markCompleted(created.correlationID, paidAt);
      expect(first.count).toBe(1);

      const afterFirst = await repo.findByCorrelationId(created.correlationID);
      expect(afterFirst?.status).toBe("completed");
      expect(afterFirst?.paidAt).toBe(paidAt.toISOString());

      // Replaying the same webhook delivery (or a duplicate) must be a no-op:
      // the `updateMany`'s `where: { status: "pending" }` no longer matches,
      // so the count is 0 and nothing is overwritten (e.g. a different
      // paidAt from a stale retry never clobbers the first one).
      const second = await repo.markCompleted(created.correlationID, new Date("2026-09-01T00:00:00.000Z"));
      expect(second.count).toBe(0);

      const afterSecond = await repo.findByCorrelationId(created.correlationID);
      expect(afterSecond?.status).toBe("completed");
      expect(afterSecond?.paidAt).toBe(paidAt.toISOString());
    });

    it("returns count 0 for an unknown correlationID", async () => {
      const result = await repo.markCompleted(
        "00000000-0000-0000-0000-000000000000",
        new Date(),
      );
      expect(result.count).toBe(0);
    });
  });
});
