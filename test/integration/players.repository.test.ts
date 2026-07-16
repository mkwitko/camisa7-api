import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPlayersRepository } from "../../src/http/api/players/players.repository";
import { startTestDb, type TestDb } from "./helpers/db";

describe("playersRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createPlayersRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createPlayersRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe('TRUNCATE TABLE "Player", "User" CASCADE');
  });

  async function createUser(email: string, name = "User"): Promise<string> {
    const user = await testDb.prisma.user.create({ data: { email, name } });
    return user.id;
  }

  describe("findOrCreateForUser", () => {
    it("reuses the existing Player on a second call", async () => {
      const userId = await createUser("reuse@x.com");

      const first = await repo.findOrCreateForUser(userId);
      const second = await repo.findOrCreateForUser(userId);

      expect(second.id).toBe(first.id);
      const rows = await testDb.prisma.player.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
    });

    // F1-5: closes the Fase 0 TOCTOU gap — `Player.userId` is now backed by a
    // hand-written partial unique index (`player_user_unique`, see that
    // migration). Firing two calls for the SAME brand-new `userId` without
    // awaiting between them races both `findFirst` checks against a single
    // `create` slot: whichever loses hits P2002, which `findOrCreateForUser`
    // must catch and resolve to the winner's row instead of throwing. Either
    // outcome of the actual race (both `findFirst`s missed, or the second
    // one already saw the first's row) must converge on exactly one row —
    // this assertion holds regardless of which branch fired, so the test is
    // not flaky even though the race itself is timing-dependent.
    it("tolerates a concurrent race for the same user without creating a duplicate Player", async () => {
      const userId = await createUser("race@x.com");

      const [a, b] = await Promise.all([
        repo.findOrCreateForUser(userId),
        repo.findOrCreateForUser(userId),
      ]);

      expect(a.id).toBe(b.id);
      const rows = await testDb.prisma.player.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
    });

    it("creates a fresh guest-less Player (userId set, phone null) from the User's name", async () => {
      const userId = await createUser("fresh@x.com", "Fresh Player");

      const player = await repo.findOrCreateForUser(userId);

      expect(player.userId).toBe(userId);
      expect(player.name).toBe("Fresh Player");
      expect(player.phone).toBeNull();
      // Task 1 (UX overhaul, FM rating model): a brand-new Player starts
      // with an empty self-declared affinity map.
      expect(player.affinity).toEqual({});
    });
  });

  describe("affinity (Task 1, UX overhaul — FM rating model)", () => {
    it("defaults to an empty map on a freshly created guest Player", async () => {
      const player = await repo.createGuest({ name: "Guest" });

      expect(player.affinity).toEqual({});
    });

    it("round-trips a self-declared affinity map written directly on the Player row", async () => {
      const userId = await createUser("affinity@x.com");
      const player = await repo.findOrCreateForUser(userId);

      await testDb.prisma.player.update({
        where: { id: player.id },
        data: { affinity: { atacante: 80, meia: 60 } },
      });

      const reloaded = await repo.findById(player.id);

      expect(reloaded?.affinity).toEqual({ atacante: 80, meia: 60 });
    });
  });
});
