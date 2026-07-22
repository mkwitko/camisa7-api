import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupsRepository } from "../../groups.repository";
import type { Group } from "../../groups.types";

// `isWooviConfigured`/`createSubaccount` are module-level exports (not
// injected deps), so they're mocked at the module boundary — same pattern
// `create-connect-account.service.test.ts` uses for the Stripe equivalent.
const h = vi.hoisted(() => ({
  wooviConfigured: true,
  createSubaccount: vi.fn(),
}));

vi.mock("@/infra/woovi/client", () => ({
  get isWooviConfigured() {
    return h.wooviConfigured;
  },
  createSubaccount: h.createSubaccount,
}));

const { createCreateSubaccountService } = await import("./create-subaccount.service");

const OWNER = "user-owner";
const OUTSIDER = "user-outsider";

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: OWNER,
  statsMode: "organizador",
  monthlyFeeCents: null,
  isPublic: false,
  joinPolicy: "open",
  wooviPixKey: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(group),
    update: vi.fn().mockImplementation(async (_id, patch) => ({ ...aGroup(), ...patch })),
    listOwnedBy: vi.fn(),
    listOwnedByWithMeta: vi.fn(),
  };
}

beforeEach(() => {
  h.wooviConfigured = true;
  h.createSubaccount
    .mockReset()
    .mockResolvedValue({ id: "sub_1", name: "Team A", pixKey: "pix@ex.com" });
});

describe("createCreateSubaccountService", () => {
  it("creates the Woovi subaccount and persists the pixKey for the owner", async () => {
    const groupsRepo = fakeGroupsRepo(aGroup());
    const service = createCreateSubaccountService({ groupsRepo });

    const result = await service({ groupId: "g1", userId: OWNER, pixKey: "pix@ex.com" });

    expect(h.createSubaccount).toHaveBeenCalledWith({ name: "Team A", pixKey: "pix@ex.com" });
    expect(groupsRepo.update).toHaveBeenCalledWith("g1", { wooviPixKey: "pix@ex.com" });
    expect(result).toEqual({ pixKey: "pix@ex.com" });
  });

  it("is idempotent: does not recreate the subaccount when the pixKey is unchanged", async () => {
    const groupsRepo = fakeGroupsRepo(aGroup({ wooviPixKey: "pix@ex.com" }));
    const service = createCreateSubaccountService({ groupsRepo });

    const result = await service({ groupId: "g1", userId: OWNER, pixKey: "pix@ex.com" });

    expect(h.createSubaccount).not.toHaveBeenCalled();
    expect(groupsRepo.update).not.toHaveBeenCalled();
    expect(result).toEqual({ pixKey: "pix@ex.com" });
  });

  it("rejects with WOO-T0001 (503) when Woovi isn't configured", async () => {
    h.wooviConfigured = false;
    const groupsRepo = fakeGroupsRepo(aGroup());
    const service = createCreateSubaccountService({ groupsRepo });

    await expect(
      service({ groupId: "g1", userId: OWNER, pixKey: "pix@ex.com" }),
    ).rejects.toMatchObject({ code: "WOO-T0001", statusCode: 503 });
    expect(h.createSubaccount).not.toHaveBeenCalled();
    expect(groupsRepo.update).not.toHaveBeenCalled();
  });

  it("rejects with GRP-T0002 (403) for a non-owner", async () => {
    const groupsRepo = fakeGroupsRepo(aGroup({ ownerId: OWNER }));
    const service = createCreateSubaccountService({ groupsRepo });

    await expect(
      service({ groupId: "g1", userId: OUTSIDER, pixKey: "pix@ex.com" }),
    ).rejects.toMatchObject({ code: "GRP-T0002", statusCode: 403 });
    expect(h.createSubaccount).not.toHaveBeenCalled();
    expect(groupsRepo.update).not.toHaveBeenCalled();
  });

  it("rejects with GRP-T0001 (404, conceal) when the group doesn't exist", async () => {
    const groupsRepo = fakeGroupsRepo(null);
    const service = createCreateSubaccountService({ groupsRepo });

    await expect(
      service({ groupId: "g1", userId: OWNER, pixKey: "pix@ex.com" }),
    ).rejects.toMatchObject({ code: "GRP-T0001", statusCode: 404 });
  });
});
