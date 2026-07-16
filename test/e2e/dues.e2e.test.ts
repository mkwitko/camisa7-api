import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { competencyMonth } from "../../src/http/api/dues/competency";
import { createDuesRepository } from "../../src/http/api/dues/dues.repository";
import { createMembersRepository } from "../../src/http/api/groups/children/members/members.repository";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string, name = "Player") =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name },
  });

async function registerAndGetToken(h: TestApp, email: string, name = "Player"): Promise<string> {
  const res = await register(h, email, name);
  return res.json().accessToken as string;
}

const createGroup = (h: TestApp, token: string, body: { name: string } = { name: "Team A" }) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const listDues = (h: TestApp, token: string, groupId: string, month?: string) =>
  h.app.inject({
    method: "GET",
    url: `/groups/${groupId}/dues${month ? `?month=${month}` : ""}`,
    headers: { authorization: `Bearer ${token}` },
  });

const markPaidDue = (h: TestApp, token: string, dueId: string) =>
  h.app.inject({
    method: "POST",
    url: `/dues/${dueId}/mark-paid`,
    headers: { authorization: `Bearer ${token}` },
  });

const confirmDue = (h: TestApp, token: string, dueId: string, body?: { paid: boolean }) =>
  h.app.inject({
    method: "POST",
    url: `/dues/${dueId}/confirm`,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });

const THIS_MONTH = competencyMonth(new Date());

/** Adds `userId` as a `mensalista` member of `groupId` and seeds one due for `month`, directly via the repos (no HTTP endpoint exists yet for a registered user to self-join a group — same repo-direct pattern `attendance.e2e.test.ts` uses). */
async function seedMensalistaDue(
  h: TestApp,
  opts: { groupId: string; userId: string; month?: string; amountCents?: number },
) {
  const membersRepo = createMembersRepository(h.prisma);
  const member = await membersRepo.addForUser(opts.groupId, opts.userId, "jogador");
  await membersRepo.updateRating(member.id, { billingMode: "mensalista" });

  const duesRepo = createDuesRepository(h.prisma);
  const due = await duesRepo.ensureForMember(
    member.id,
    opts.month ?? THIS_MONTH,
    opts.amountCents ?? 5000,
  );
  return { member, due };
}

describe("dues e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "MembershipDue", "GroupMember", "Group", "Player", "User" CASCADE',
    );
  });

  describe("GET /groups/:groupId/dues", () => {
    it("lets the owner list dues for a given month", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberUserId = (await register(h, "member-owner-list@x.com", "Member")).json().user
        .id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await listDues(h, ownerToken, groupId, THIS_MONTH);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0]).toMatchObject({
        id: due.id,
        competencyMonth: THIS_MONTH,
        status: "pending",
        amountCents: 5000,
      });
    });

    it("lets a member (not the owner) list the group's dues", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list-member@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-list@x.com", "Member");
      const memberToken = memberRegister.json().accessToken as string;
      const memberUserId = memberRegister.json().user.id as string;
      await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await listDues(h, memberToken, groupId, THIS_MONTH);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });

    it("rejects an unrelated authenticated user (not owner, not a member) with 403 DUE-T0002", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-list-unrelated@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const outsiderToken = await registerAndGetToken(h, "outsider-list@x.com");

      const res = await listDues(h, outsiderToken, groupId, THIS_MONTH);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("DUE-T0002");
    });

    it("defaults month to the current competency month when omitted", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-default-month@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberUserId = (await register(h, "member-default-month@x.com", "Member")).json().user
        .id as string;
      await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await listDues(h, ownerToken, groupId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].competencyMonth).toBe(THIS_MONTH);
    });
  });

  describe("POST /dues/:id/mark-paid", () => {
    it("allows the member to self-declare their own due as paid", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-mark-self@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-mark-self@x.com", "Member");
      const memberToken = memberRegister.json().accessToken as string;
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await markPaidDue(h, memberToken, due.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "paid", paidConfirmedById: null });
    });

    it("allows the group owner to mark another member's due as paid", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-mark-other@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-mark-other@x.com", "Member");
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await markPaidDue(h, ownerToken, due.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "paid", paidConfirmedById: null });
    });

    it("rejects an unrelated authenticated user (not owner, not self) with 403 DUE-T0002", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-mark-unrelated@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-mark-unrelated@x.com", "Member");
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });
      const outsiderToken = await registerAndGetToken(h, "outsider-mark@x.com");

      const res = await markPaidDue(h, outsiderToken, due.id);

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("DUE-T0002");
    });

    it("returns 404 DUE-T0001 for an unknown due id", async () => {
      const token = await registerAndGetToken(h, "unknown-due-mark@x.com");

      const res = await markPaidDue(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("DUE-T0001");
    });
  });

  describe("POST /dues/:id/confirm", () => {
    it("lets the group owner confirm a due, setting paidConfirmedById to the owner's userId", async () => {
      const ownerRegister = await register(h, "owner-confirm@x.com", "Owner");
      const ownerToken = ownerRegister.json().accessToken as string;
      const ownerUserId = ownerRegister.json().user.id as string;
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-confirm@x.com", "Member");
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const res = await confirmDue(h, ownerToken, due.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "paid", paidConfirmedById: ownerUserId });
    });

    it("lets the owner toggle a due back to pending via { paid: false }", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-unconfirm@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-unconfirm@x.com", "Member");
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });
      await confirmDue(h, ownerToken, due.id);

      const res = await confirmDue(h, ownerToken, due.id, { paid: false });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "pending", paidConfirmedById: null });
    });

    it("rejects a non-owner (including the member themself) with 403 GRP-T0002", async () => {
      const ownerToken = await registerAndGetToken(h, "owner-confirm-unrelated@x.com", "Owner");
      const group = await createGroup(h, ownerToken, { name: "Team A" });
      const { id: groupId } = group.json();
      const memberRegister = await register(h, "member-confirm-unrelated@x.com", "Member");
      const memberToken = memberRegister.json().accessToken as string;
      const memberUserId = memberRegister.json().user.id as string;
      const { due } = await seedMensalistaDue(h, { groupId, userId: memberUserId });

      const selfRes = await confirmDue(h, memberToken, due.id);
      expect(selfRes.statusCode).toBe(403);
      expect(selfRes.json().code).toBe("GRP-T0002");

      const outsiderToken = await registerAndGetToken(h, "outsider-confirm@x.com");
      const outsiderRes = await confirmDue(h, outsiderToken, due.id);
      expect(outsiderRes.statusCode).toBe(403);
      expect(outsiderRes.json().code).toBe("GRP-T0002");
    });

    it("returns 404 DUE-T0001 for an unknown due id", async () => {
      const token = await registerAndGetToken(h, "unknown-due-confirm@x.com");

      const res = await confirmDue(h, token, "00000000-0000-0000-0000-000000000000");

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("DUE-T0001");
    });
  });
});
