import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { createAttendanceRepository } from "../../src/http/api/matches/children/attendance/attendance.repository";
import { createMatchesRepository } from "../../src/http/api/matches/matches.repository";
import type { Player } from "../../src/http/api/players/players.types";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("attendanceRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createAttendanceRepository>;
  let matchesRepo: ReturnType<typeof createMatchesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createAttendanceRepository(testDb.prisma);
    matchesRepo = createMatchesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Attendance", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  async function seedMatch(opts: { slots: number }): Promise<{ id: string }> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    const match = await matchesRepo.insert({
      groupId: group.id,
      datetime: "2026-08-01T20:00:00.000Z",
      location: "Quadra Central",
      priceCents: 0,
      slots: opts.slots,
    });
    return { id: match.id };
  }

  async function seedPlayers(names: string[]): Promise<Player[]> {
    const players: Player[] = [];
    for (const name of names) {
      const row = await testDb.prisma.player.create({ data: { userId: null, name, phone: null } });
      players.push({ id: row.id, userId: row.userId, name: row.name, phone: row.phone });
    }
    return players;
  }

  describe("confirm", () => {
    it("fills slots then waitlists, and auto-promotes on cancel", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1, p2, p3] = await seedPlayers(["P1", "P2", "P3"]);
      if (!p1 || !p2 || !p3) throw new Error("expected 3 players");

      const a1 = await repo.confirm(m.id, p1);
      expect(a1.attendance.status).toBe("confirmed");

      const a2 = await repo.confirm(m.id, p2); // fills → match full
      expect(a2.attendance.status).toBe("confirmed");
      const matchAfterFill = await matchesRepo.findById(m.id);
      expect(matchAfterFill?.status).toBe("full");

      const a3 = await repo.confirm(m.id, p3); // waitlisted pos 1
      expect(a3.attendance.status).toBe("waitlisted");
      expect(a3.attendance.waitlistPos).toBe(1);

      const { promoted, cancelled } = await repo.cancelAndPromote(m.id, a1.attendance.id);
      expect(cancelled.status).toBe("cancelled");
      expect(promoted?.player.name).toBe("P3");
      expect(promoted?.status).toBe("confirmed");
      expect(promoted?.waitlistPos).toBeNull();

      const matchAfterPromotion = await matchesRepo.findById(m.id);
      expect(matchAfterPromotion?.status).toBe("full"); // slots still full (P2 + promoted P3)
    });

    it("does not set the match to full while under slots", async () => {
      const m = await seedMatch({ slots: 3 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      await repo.confirm(m.id, p1);

      const match = await matchesRepo.findById(m.id);
      expect(match?.status).toBe("open");
    });

    it("assigns increasing waitlistPos to further waitlisted players", async () => {
      const m = await seedMatch({ slots: 1 });
      const [p1, p2, p3] = await seedPlayers(["P1", "P2", "P3"]);
      if (!p1 || !p2 || !p3) throw new Error("expected 3 players");

      await repo.confirm(m.id, p1);
      const second = await repo.confirm(m.id, p2);
      const third = await repo.confirm(m.id, p3);

      expect(second.attendance.waitlistPos).toBe(1);
      expect(third.attendance.waitlistPos).toBe(2);
    });

    it("never double-books the last slot under real concurrency (FOR UPDATE serializes confirms)", async () => {
      // The race this whole task exists to prevent: N concurrent confirms
      // for a match with fewer slots than N must yield EXACTLY `slots`
      // confirmed rows, never more — the `SELECT ... FOR UPDATE` lock (first
      // statement of `confirm`'s transaction) serializes the concurrent
      // transactions on the match row, so the 2nd..Nth callers each see the
      // 1st's committed confirmed-count before deciding confirmed vs
      // waitlisted. Without the lock, two concurrent transactions could both
      // read confirmedCount=0 and both write "confirmed" for a slots:1 match.
      const m = await seedMatch({ slots: 3 });
      const players = await seedPlayers(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);

      const results = await Promise.all(players.map((p) => repo.confirm(m.id, p)));

      const confirmed = results.filter((r) => r.attendance.status === "confirmed");
      const waitlisted = results.filter((r) => r.attendance.status === "waitlisted");
      expect(confirmed).toHaveLength(3);
      expect(waitlisted).toHaveLength(5);

      // Waitlist positions are a contiguous 1..5 sequence with no duplicates
      // or gaps — proof no two transactions raced to grab the same position.
      const positions = waitlisted
        .map((r) => r.attendance.waitlistPos)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(positions).toEqual([1, 2, 3, 4, 5]);

      const match = await matchesRepo.findById(m.id);
      expect(match?.status).toBe("full");

      // Cross-check against the DB directly, independent of what confirm()
      // returned to each caller.
      const all = await repo.listByMatch(m.id);
      expect(all.filter((a) => a.status === "confirmed")).toHaveLength(3);
      expect(all.filter((a) => a.status === "waitlisted")).toHaveLength(5);
    });

    it("throws ATT-T0001 on a duplicate confirm of an active attendee", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      await repo.confirm(m.id, p1);

      await expect(repo.confirm(m.id, p1)).rejects.toMatchObject({
        code: "ATT-T0001",
        statusCode: 409,
      });
    });

    it("allows re-confirming after a previous attendance was cancelled", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      const first = await repo.confirm(m.id, p1);
      await repo.cancelAndPromote(m.id, first.attendance.id);

      const second = await repo.confirm(m.id, p1);
      expect(second.attendance.status).toBe("confirmed");
    });
  });

  describe("cancelAndPromote", () => {
    it("decrements remaining waitlist positions when a waitlisted attendee cancels", async () => {
      const m = await seedMatch({ slots: 1 });
      const [p1, p2, p3] = await seedPlayers(["P1", "P2", "P3"]);
      if (!p1 || !p2 || !p3) throw new Error("expected 3 players");

      await repo.confirm(m.id, p1);
      const second = await repo.confirm(m.id, p2); // pos 1
      const third = await repo.confirm(m.id, p3); // pos 2

      const { promoted } = await repo.cancelAndPromote(m.id, second.attendance.id);
      expect(promoted).toBeNull(); // cancelling a waitlisted attendee promotes no one

      const all = await repo.listByMatch(m.id);
      const p3Row = all.find((a) => a.id === third.attendance.id);
      expect(p3Row?.waitlistPos).toBe(1); // shifted down from 2
    });

    it("sets match back to open when a confirmed attendee cancels and no one is waitlisted", async () => {
      const m = await seedMatch({ slots: 1 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      const a1 = await repo.confirm(m.id, p1);
      expect((await matchesRepo.findById(m.id))?.status).toBe("full");

      const { promoted } = await repo.cancelAndPromote(m.id, a1.attendance.id);
      expect(promoted).toBeNull();
      expect((await matchesRepo.findById(m.id))?.status).toBe("open");
    });

    it("throws ATT-T0002 when the attendance id does not belong to the match", async () => {
      const m = await seedMatch({ slots: 2 });

      await expect(
        repo.cancelAndPromote(m.id, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({
        code: "ATT-T0002",
        statusCode: 404,
      });
    });
  });

  describe("listByMatch", () => {
    it("lists all attendances for a match, including cancelled ones", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1, p2] = await seedPlayers(["P1", "P2"]);
      if (!p1 || !p2) throw new Error("expected 2 players");

      const a1 = await repo.confirm(m.id, p1);
      await repo.confirm(m.id, p2);
      await repo.cancelAndPromote(m.id, a1.attendance.id);

      const all = await repo.listByMatch(m.id);
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.status).sort()).toEqual(["cancelled", "confirmed"]);
    });
  });

  describe("listByPlayer", () => {
    it("lists every attendance for a player across every match — feeds the F1-4 career engine", async () => {
      const m1 = await seedMatch({ slots: 2 });
      const m2 = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      await repo.confirm(m1.id, p1);
      await repo.confirm(m2.id, p1);

      const rows = await repo.listByPlayer(p1.id);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.matchId).sort()).toEqual([m1.id, m2.id].sort());
    });

    it("returns an empty array for a player with no attendances", async () => {
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      expect(await repo.listByPlayer(p1.id)).toEqual([]);
    });
  });

  describe("findById", () => {
    it("returns the attendance scoped to its match", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      const a1 = await repo.confirm(m.id, p1);

      const found = await repo.findById(m.id, a1.attendance.id);
      expect(found?.id).toBe(a1.attendance.id);
      expect(found?.player.name).toBe("P1");
    });

    it("returns null when the attendance does not belong to the match", async () => {
      const m1 = await seedMatch({ slots: 2 });
      const m2 = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      const a1 = await repo.confirm(m1.id, p1);

      await expect(repo.findById(m2.id, a1.attendance.id)).resolves.toBeNull();
    });

    it("returns null for an unknown attendance id", async () => {
      const m = await seedMatch({ slots: 2 });

      await expect(repo.findById(m.id, "00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
    });
  });

  describe("setPayment", () => {
    it("updates paymentStatus and paidConfirmedById", async () => {
      const m = await seedMatch({ slots: 2 });
      const [p1] = await seedPlayers(["P1"]);
      if (!p1) throw new Error("expected player");

      const a1 = await repo.confirm(m.id, p1);
      const ownerId = await createOwner(testDb.prisma);
      const updated = await repo.setPayment(a1.attendance.id, "paid", ownerId);

      expect(updated.paymentStatus).toBe("paid");
      expect(updated.paidConfirmedById).toBe(ownerId);
    });
  });
});
