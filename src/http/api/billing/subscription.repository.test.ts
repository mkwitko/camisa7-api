import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOwner } from "../../../../test/builders/group.builder";
import { startTestDb, type TestDb } from "../../../../test/integration/helpers/db";
import {
  createSubscriptionsRepository,
  type SubscriptionsRepository,
} from "./subscription.repository";

describe("subscriptionsRepository (integration)", () => {
  let testDb: TestDb;
  let repo: SubscriptionsRepository;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createSubscriptionsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Subscription", "GroupMember", "Player", "Group", "User" CASCADE',
    );
  });

  describe("create + findByCorrelationId", () => {
    it("inserts a pending Subscription with wooviCorrelationID equal to id, and round-trips it", async () => {
      const userId = await createOwner(testDb.prisma);

      const created = await repo.create({ userId, plan: "organizer" });

      expect(created.id).toBe(created.wooviCorrelationID);
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created).toMatchObject({
        userId,
        plan: "organizer",
        status: "pending",
        recurrencyId: null,
        currentPeriodEnd: null,
      });

      const found = await repo.findByCorrelationId(created.wooviCorrelationID);
      expect(found).toEqual(created);
    });

    it("returns null for an unknown correlationID", async () => {
      await expect(
        repo.findByCorrelationId("00000000-0000-0000-0000-000000000000"),
      ).resolves.toBeNull();
    });
  });

  describe("findActiveByUser", () => {
    it("returns null when the user has no Subscription at all", async () => {
      const userId = await createOwner(testDb.prisma);
      await expect(repo.findActiveByUser(userId)).resolves.toBeNull();
    });

    it("excludes a pending Subscription (not yet active)", async () => {
      const userId = await createOwner(testDb.prisma);
      await repo.create({ userId, plan: "player" });

      await expect(repo.findActiveByUser(userId)).resolves.toBeNull();
    });

    it("excludes a canceled Subscription", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "player" });
      await repo.setStatus(sub.id, "canceled");

      await expect(repo.findActiveByUser(userId)).resolves.toBeNull();
    });

    it("excludes an active Subscription whose currentPeriodEnd is in the past (lapsed)", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "player" });
      await repo.setActive(sub.wooviCorrelationID, { recurrencyId: "recur-1" });
      await repo.extendPeriod(sub.wooviCorrelationID, new Date("2020-01-01T00:00:00.000Z"));

      await expect(repo.findActiveByUser(userId)).resolves.toBeNull();
    });

    it("returns an active Subscription whose currentPeriodEnd is null (never billed yet)", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "organizer" });
      await repo.setActive(sub.wooviCorrelationID, { recurrencyId: "recur-2" });

      const found = await repo.findActiveByUser(userId);
      expect(found?.id).toBe(sub.id);
      expect(found?.status).toBe("active");
    });

    it("returns an active Subscription whose currentPeriodEnd is in the future", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "organizer" });
      await repo.setActive(sub.wooviCorrelationID, { recurrencyId: "recur-3" });
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await repo.extendPeriod(sub.wooviCorrelationID, future);

      const found = await repo.findActiveByUser(userId);
      expect(found?.id).toBe(sub.id);
      expect(found?.currentPeriodEnd).toBe(future.toISOString());
    });

    it("returns only the most recent active Subscription when the user resubscribed", async () => {
      const userId = await createOwner(testDb.prisma);
      const first = await repo.create({ userId, plan: "player" });
      await repo.setActive(first.wooviCorrelationID, { recurrencyId: "recur-old" });
      await repo.setStatus(first.id, "canceled");

      const second = await repo.create({ userId, plan: "organizer" });
      await repo.setActive(second.wooviCorrelationID, { recurrencyId: "recur-new" });

      const found = await repo.findActiveByUser(userId);
      expect(found?.id).toBe(second.id);
      expect(found?.plan).toBe("organizer");
    });
  });

  describe("findLatestByUser", () => {
    it("returns null when the user has no Subscription", async () => {
      const userId = await createOwner(testDb.prisma);
      await expect(repo.findLatestByUser(userId)).resolves.toBeNull();
    });

    it("returns the most recently created Subscription regardless of status", async () => {
      const userId = await createOwner(testDb.prisma);
      const first = await repo.create({ userId, plan: "player" });
      await repo.setStatus(first.id, "canceled");
      const second = await repo.create({ userId, plan: "organizer" });

      const found = await repo.findLatestByUser(userId);
      expect(found?.id).toBe(second.id);
      expect(found?.status).toBe("pending");
    });
  });

  describe("setStatus", () => {
    it("updates status and, via patch, recurrencyId/currentPeriodEnd in the same write", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "player" });
      const until = new Date("2026-09-05T00:00:00.000Z");

      const updated = await repo.setStatus(sub.id, "active", {
        recurrencyId: "recur-xyz",
        currentPeriodEnd: until,
      });

      expect(updated.status).toBe("active");
      expect(updated.recurrencyId).toBe("recur-xyz");
      expect(updated.currentPeriodEnd).toBe(until.toISOString());
    });

    it("updates status alone when no patch is given", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "player" });

      const updated = await repo.setStatus(sub.id, "expired");

      expect(updated.status).toBe("expired");
      expect(updated.recurrencyId).toBeNull();
    });
  });

  describe("setActive", () => {
    it("marks the Subscription active and stores recurrencyId, looked up by wooviCorrelationID", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "organizer" });

      const updated = await repo.setActive(sub.wooviCorrelationID, { recurrencyId: "recur-abc" });

      expect(updated.status).toBe("active");
      expect(updated.recurrencyId).toBe("recur-abc");
    });
  });

  describe("extendPeriod", () => {
    it("advances currentPeriodEnd, looked up by wooviCorrelationID", async () => {
      const userId = await createOwner(testDb.prisma);
      const sub = await repo.create({ userId, plan: "organizer" });
      await repo.setActive(sub.wooviCorrelationID, { recurrencyId: "recur-def" });
      const until = new Date("2026-10-05T00:00:00.000Z");

      const updated = await repo.extendPeriod(sub.wooviCorrelationID, until);

      expect(updated.currentPeriodEnd).toBe(until.toISOString());
    });
  });
});
