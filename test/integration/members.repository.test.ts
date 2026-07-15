import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

describe("membersRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createMembersRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createMembersRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "GroupMember", "Player", "Group", "User" CASCADE',
    );
  });

  async function createGroup(name = "Test Group"): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId, { name }));
    return group.id;
  }

  describe("addGuest", () => {
    it("creates a guest Player (userId null) and a jogador GroupMember with the given rating", async () => {
      const groupId = await createGroup();

      const member = await repo.addGuest(groupId, {
        name: "Guest Player",
        phone: "+55 11 90000-0000",
        primaryPos: "atacante",
        secondaryPos: ["meia"],
        affinity: { atacante: 8, meia: 6 },
        seedOverall: { atacante: 70 },
      });

      expect(member).toMatchObject({
        groupId,
        role: "jogador",
        primaryPos: "atacante",
        secondaryPos: ["meia"],
        affinity: { atacante: 8, meia: 6 },
        seedOverall: { atacante: 70 },
      });
      expect(member.player).toMatchObject({
        userId: null,
        name: "Guest Player",
        phone: "+55 11 90000-0000",
      });
      expect(member.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("defaults phone to null, secondaryPos/affinity/seedOverall to empty when omitted", async () => {
      const groupId = await createGroup();

      const member = await repo.addGuest(groupId, { name: "Minimal Guest", primaryPos: "goleiro" });

      expect(member.player.phone).toBeNull();
      expect(member.secondaryPos).toEqual([]);
      expect(member.affinity).toEqual({});
      expect(member.seedOverall).toEqual({});
    });
  });

  describe("listByGroup", () => {
    it("returns members ordered by player name", async () => {
      const groupId = await createGroup();
      await repo.addGuest(groupId, { name: "Zeca", primaryPos: "goleiro" });
      await repo.addGuest(groupId, { name: "Ana", primaryPos: "meia" });
      await repo.addGuest(groupId, { name: "Bruno", primaryPos: "atacante" });

      const members = await repo.listByGroup(groupId);

      expect(members.map((m) => m.player.name)).toEqual(["Ana", "Bruno", "Zeca"]);
    });

    it("does not return members from another group", async () => {
      const groupA = await createGroup("Group A");
      const groupB = await createGroup("Group B");
      await repo.addGuest(groupA, { name: "Player A", primaryPos: "goleiro" });
      await repo.addGuest(groupB, { name: "Player B", primaryPos: "goleiro" });

      const members = await repo.listByGroup(groupA);

      expect(members).toHaveLength(1);
      expect(members[0]?.player.name).toBe("Player A");
    });

    it("returns an empty array for a group with no members", async () => {
      const groupId = await createGroup();

      expect(await repo.listByGroup(groupId)).toEqual([]);
    });
  });

  describe("findInGroup", () => {
    it("returns the member when it belongs to the group", async () => {
      const groupId = await createGroup();
      const added = await repo.addGuest(groupId, { name: "Guest", primaryPos: "lateral" });

      const found = await repo.findInGroup(groupId, added.id);

      expect(found).toEqual(added);
    });

    it("returns null when the member belongs to a different group", async () => {
      const groupA = await createGroup("Group A");
      const groupB = await createGroup("Group B");
      const added = await repo.addGuest(groupA, { name: "Guest", primaryPos: "lateral" });

      expect(await repo.findInGroup(groupB, added.id)).toBeNull();
    });
  });

  describe("findByGroupAndPlayer", () => {
    it("returns the member when the player belongs to the group — feeds the F1-4 career engine's bootstrap", async () => {
      const groupId = await createGroup();
      const added = await repo.addGuest(groupId, { name: "Guest", primaryPos: "lateral" });

      const found = await repo.findByGroupAndPlayer(groupId, added.player.id);

      expect(found).toEqual(added);
    });

    it("returns null when the player has no membership in that group", async () => {
      const groupA = await createGroup("Group A");
      const groupB = await createGroup("Group B");
      const added = await repo.addGuest(groupA, { name: "Guest", primaryPos: "lateral" });

      expect(await repo.findByGroupAndPlayer(groupB, added.player.id)).toBeNull();
    });
  });

  describe("updateRating", () => {
    it("updates only the fields present in the patch", async () => {
      const groupId = await createGroup();
      const added = await repo.addGuest(groupId, {
        name: "Guest",
        primaryPos: "zagueiro",
        secondaryPos: ["lateral"],
      });

      const updated = await repo.updateRating(added.id, {
        primaryPos: "lateral",
        seedOverall: { lateral: 65 },
      });

      expect(updated).toMatchObject({
        primaryPos: "lateral",
        secondaryPos: ["lateral"],
        seedOverall: { lateral: 65 },
      });
    });
  });

  describe("unique constraint (groupId, playerId)", () => {
    it("rejects a second GroupMember row for the same group+player with Prisma P2002", async () => {
      const groupId = await createGroup();
      const added = await repo.addGuest(groupId, { name: "Guest", primaryPos: "volante" });

      await expect(
        testDb.prisma.groupMember.create({
          data: {
            groupId,
            playerId: added.player.id,
            role: "jogador",
            primaryPos: "volante",
            secondaryPos: [],
            affinity: {},
            seedOverall: {},
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  describe("addForUser", () => {
    it("creates an organizador member linked to the user's Player, defaulting primaryPos to meia", async () => {
      const groupId = await createGroup();
      const ownerId = await createOwner(testDb.prisma, { name: "Alice Owner" });

      const member = await repo.addForUser(groupId, ownerId, "organizador");

      expect(member).toMatchObject({ groupId, role: "organizador", primaryPos: "meia" });
      expect(member.player).toMatchObject({ userId: ownerId, name: "Alice Owner" });
    });

    it("reuses the same Player across two groups for the same user", async () => {
      const groupA = await createGroup("Group A");
      const groupB = await createGroup("Group B");
      const userId = await createOwner(testDb.prisma);

      const memberA = await repo.addForUser(groupA, userId, "organizador");
      const memberB = await repo.addForUser(groupB, userId, "jogador");

      expect(memberA.player.id).toBe(memberB.player.id);
    });
  });

  describe("isUserInGroup", () => {
    it("returns true when the user has a GroupMember row in the group", async () => {
      const groupId = await createGroup();
      const userId = await createOwner(testDb.prisma);
      await repo.addForUser(groupId, userId, "jogador");

      await expect(repo.isUserInGroup(groupId, userId)).resolves.toBe(true);
    });

    it("returns false for a user with no membership in the group", async () => {
      const groupId = await createGroup();
      const userId = await createOwner(testDb.prisma);

      await expect(repo.isUserInGroup(groupId, userId)).resolves.toBe(false);
    });
  });
});
