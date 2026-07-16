import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

const register = (h: TestApp, email: string) =>
  h.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "s3cret!!", name: "Owner" },
  });

async function registerAndGetToken(h: TestApp, email: string): Promise<string> {
  const res = await register(h, email);
  return res.json().accessToken as string;
}

const createGroup = (h: TestApp, token: string, body: { name: string } = { name: "Team A" }) =>
  h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const addMember = (h: TestApp, token: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const listMembers = (h: TestApp, token: string, groupId: string) =>
  h.app.inject({
    method: "GET",
    url: `/groups/${groupId}/members`,
    headers: { authorization: `Bearer ${token}` },
  });

describe("members e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "GroupMember", "Player", "Group", "User" CASCADE',
    );
  });

  describe("POST /groups/:id/members", () => {
    it("lets the owner add a guest player with a rating, returning 201 with userId:null and role jogador", async () => {
      const token = await registerAndGetToken(h, "owner@x.com");
      const created = await createGroup(h, token, { name: "Team A" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        phone: "+55 11 90000-0000",
        primaryPos: "atacante",
        secondaryPos: ["meia"],
        affinity: { atacante: 8, meia: 6 },
        seedOverall: { atacante: 70 },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.player.userId).toBeNull();
      expect(body.player.name).toBe("Guest Player");
      expect(body.role).toBe("jogador");
      expect(body.primaryPos).toBe("atacante");
      expect(body.secondaryPos).toEqual(["meia"]);
      expect(body.affinity).toEqual({ atacante: 8, meia: 6 });
      expect(body.seedOverall).toEqual({ atacante: 70 });
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner2@x.com");
      const otherToken = await registerAndGetToken(h, "other2@x.com");
      const created = await createGroup(h, ownerToken, { name: "Team B" });
      const { id: groupId } = created.json();

      const res = await addMember(h, otherToken, groupId, {
        name: "Guest Player",
        primaryPos: "goleiro",
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects a position key outside the Position enum with 400", async () => {
      const token = await registerAndGetToken(h, "owner3@x.com");
      const created = await createGroup(h, token, { name: "Team C" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "goleiro",
        affinity: { invalidPosition: 5 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects seedOverall with value > 99 with 400", async () => {
      const token = await registerAndGetToken(h, "owner9@x.com");
      const created = await createGroup(h, token, { name: "Team I" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "atacante",
        seedOverall: { atacante: 150 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects affinity with value > 100 with 400", async () => {
      const token = await registerAndGetToken(h, "owner10@x.com");
      const created = await createGroup(h, token, { name: "Team J" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "meia",
        affinity: { meia: 101 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects affinity with negative value with 400", async () => {
      const token = await registerAndGetToken(h, "owner11@x.com");
      const created = await createGroup(h, token, { name: "Team K" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "volante",
        affinity: { volante: -5 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects seedOverall with negative value with 400", async () => {
      const token = await registerAndGetToken(h, "owner12@x.com");
      const created = await createGroup(h, token, { name: "Team L" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "zagueiro",
        seedOverall: { zagueiro: -10 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects affinity with fractional value with 400", async () => {
      const token = await registerAndGetToken(h, "owner13@x.com");
      const created = await createGroup(h, token, { name: "Team M" });
      const { id: groupId } = created.json();

      const res = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "lateral",
        affinity: { lateral: 50.5 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /groups/:id/members", () => {
    it("auto-adds the owner as an organizador member on group creation", async () => {
      const token = await registerAndGetToken(h, "owner4@x.com");
      const created = await createGroup(h, token, { name: "Team D" });
      const { id: groupId } = created.json();

      const res = await listMembers(h, token, groupId);

      expect(res.statusCode).toBe(200);
      const members = res.json();
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ role: "organizador" });
      expect(members[0].player.userId).not.toBeNull();
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner5@x.com");
      const otherToken = await registerAndGetToken(h, "other5@x.com");
      const created = await createGroup(h, ownerToken, { name: "Team E" });
      const { id: groupId } = created.json();

      const res = await listMembers(h, otherToken, groupId);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /groups/:id/members/:memberId", () => {
    it("lets the owner update a member's rating", async () => {
      const token = await registerAndGetToken(h, "owner6@x.com");
      const created = await createGroup(h, token, { name: "Team F" });
      const { id: groupId } = created.json();
      const added = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "zagueiro",
      });
      const { id: memberId } = added.json();

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { primaryPos: "lateral", seedOverall: { lateral: 65 } },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: memberId,
        primaryPos: "lateral",
        seedOverall: { lateral: 65 },
      });
    });

    it("returns 404 for a memberId that doesn't belong to the group", async () => {
      const token = await registerAndGetToken(h, "owner7@x.com");
      const created = await createGroup(h, token, { name: "Team G" });
      const { id: groupId } = created.json();

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/00000000-0000-0000-0000-000000000000`,
        headers: { authorization: `Bearer ${token}` },
        payload: { primaryPos: "lateral" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("rejects a non-owner with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner8@x.com");
      const otherToken = await registerAndGetToken(h, "other8@x.com");
      const created = await createGroup(h, ownerToken, { name: "Team H" });
      const { id: groupId } = created.json();
      const added = await addMember(h, ownerToken, groupId, {
        name: "Guest Player",
        primaryPos: "volante",
      });
      const { id: memberId } = added.json();

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { primaryPos: "meia" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("defaults a newly added guest to billingMode avulso with no override", async () => {
      const token = await registerAndGetToken(h, "owner14@x.com");
      const created = await createGroup(h, token, { name: "Team N" });
      const { id: groupId } = created.json();

      const added = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "meia",
      });

      expect(added.json()).toMatchObject({ billingMode: "avulso", monthlyFeeCentsOverride: null });
    });

    it("lets the owner set billingMode to mensalista with a fee override", async () => {
      const token = await registerAndGetToken(h, "owner15@x.com");
      const created = await createGroup(h, token, { name: "Team O" });
      const { id: groupId } = created.json();
      const added = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "meia",
      });
      const { id: memberId } = added.json();

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { billingMode: "mensalista", monthlyFeeCentsOverride: 5000 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        billingMode: "mensalista",
        monthlyFeeCentsOverride: 5000,
      });
    });

    it("clears monthlyFeeCentsOverride when explicitly set to null", async () => {
      const token = await registerAndGetToken(h, "owner16@x.com");
      const created = await createGroup(h, token, { name: "Team P" });
      const { id: groupId } = created.json();
      const added = await addMember(h, token, groupId, {
        name: "Guest Player",
        primaryPos: "meia",
      });
      const { id: memberId } = added.json();
      await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { billingMode: "mensalista", monthlyFeeCentsOverride: 5000 },
      });

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { monthlyFeeCentsOverride: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        billingMode: "mensalista",
        monthlyFeeCentsOverride: null,
      });
    });

    it("rejects a non-owner setting billingMode with 403", async () => {
      const ownerToken = await registerAndGetToken(h, "owner17@x.com");
      const otherToken = await registerAndGetToken(h, "other17@x.com");
      const created = await createGroup(h, ownerToken, { name: "Team Q" });
      const { id: groupId } = created.json();
      const added = await addMember(h, ownerToken, groupId, {
        name: "Guest Player",
        primaryPos: "meia",
      });
      const { id: memberId } = added.json();

      const res = await h.app.inject({
        method: "PATCH",
        url: `/groups/${groupId}/members/${memberId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { billingMode: "mensalista" },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
