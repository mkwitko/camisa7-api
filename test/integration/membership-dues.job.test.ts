import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { competencyMonth } from "../../src/http/api/dues/competency";
import { createDuesRepository } from "../../src/http/api/dues/dues.repository";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "../../src/http/api/groups/groups.repository";
import { generateMonthlyDues } from "../../src/jobs/membership-dues.job";
import { buildGroupInput, createOwner } from "../builders/group.builder";
import { startTestDb, type TestDb } from "./helpers/db";

const NOW = new Date("2026-03-10T00:00:00.000Z");
const MONTH = competencyMonth(NOW);

describe("generateMonthlyDues (integration)", () => {
  let testDb: TestDb;
  let duesRepo: ReturnType<typeof createDuesRepository>;
  let groupsRepo: ReturnType<typeof createGroupsRepository>;
  let membersRepo: ReturnType<typeof createMembersRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    duesRepo = createDuesRepository(testDb.prisma);
    groupsRepo = createGroupsRepository(testDb.prisma);
    membersRepo = createMembersRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MembershipDue", "GroupMember", "Player", "Group", "User" CASCADE',
    );
  });

  async function createGroupId(monthlyFeeCents: number | null): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const group = await groupsRepo.insert(buildGroupInput(ownerId));
    if (monthlyFeeCents !== null) {
      await groupsRepo.update(group.id, { monthlyFeeCents });
    }
    return group.id;
  }

  async function addMensalista(
    groupId: string,
    name: string,
    overrideCents: number | null | undefined = undefined,
  ): Promise<string> {
    const member = await membersRepo.addGuest(groupId, { name });
    await membersRepo.updateRating(member.id, {
      billingMode: "mensalista",
      ...(overrideCents !== undefined ? { monthlyFeeCentsOverride: overrideCents } : {}),
    });
    return member.id;
  }

  async function addAvulso(groupId: string, name: string): Promise<string> {
    const member = await membersRepo.addGuest(groupId, { name });
    return member.id;
  }

  it("creates a due for each mensalista with a resolvable fee (override wins over group default), skips avulso and no-fee members, and is idempotent on rerun", async () => {
    const groupId = await createGroupId(5000);
    const defaultFeeMemberId = await addMensalista(groupId, "Default Fee");
    const overrideMemberId = await addMensalista(groupId, "Override Fee", 3000);
    await addAvulso(groupId, "Avulso");

    const noFeeGroupId = await createGroupId(null);
    const noFeeMemberId = await addMensalista(noFeeGroupId, "No Fee");

    const created = await generateMonthlyDues(duesRepo, NOW);

    expect(created).toHaveLength(2);
    const byMember = new Map(created.map((d) => [d.groupMemberId, d]));
    expect(byMember.get(defaultFeeMemberId)).toMatchObject({
      amountCents: 5000,
      competencyMonth: MONTH,
      status: "pending",
    });
    expect(byMember.get(overrideMemberId)).toMatchObject({
      amountCents: 3000,
      competencyMonth: MONTH,
      status: "pending",
    });
    expect(byMember.has(noFeeMemberId)).toBe(false);

    const groupDues = await duesRepo.listByGroupMonth(groupId, MONTH);
    expect(groupDues).toHaveLength(2);
    const noFeeGroupDues = await duesRepo.listByGroupMonth(noFeeGroupId, MONTH);
    expect(noFeeGroupDues).toHaveLength(0);

    // Rerun with the same pinned `now` — idempotent: no additional rows,
    // amounts untouched (ensureForMember's `update` clause is a no-op).
    await generateMonthlyDues(duesRepo, NOW);

    const groupDuesAfterRerun = await duesRepo.listByGroupMonth(groupId, MONTH);
    expect(groupDuesAfterRerun).toHaveLength(2);
    expect(groupDuesAfterRerun.map((d) => d.amountCents).sort()).toEqual([3000, 5000]);
  });

  it("returns an empty array when there are no mensalista members with a resolvable fee", async () => {
    const groupId = await createGroupId(null);
    await addMensalista(groupId, "No Fee");
    await addAvulso(groupId, "Avulso");

    const created = await generateMonthlyDues(duesRepo, NOW);

    expect(created).toEqual([]);
  });
});
