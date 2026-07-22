import { describe, expect, it, vi } from "vitest";
import type { EntitlementsService } from "@/http/api/billing/entitlements.service";
import type { GroupsRepository } from "../groups.repository";
import type { Group } from "../groups.types";
import { createUpdateGroupService } from "./update-group.service";

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: "u1",
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

function fakeEntitlements(hasFeature: boolean): EntitlementsService {
  return {
    activeFeatures: vi.fn(),
    hasFeature: vi.fn().mockResolvedValue(hasFeature),
    paymentsEnabled: vi.fn(),
    invalidate: vi.fn(),
  };
}

describe("createUpdateGroupService", () => {
  it("throws GRP-T0003 when setting isPublic=true without the public_groups feature", async () => {
    const groupsRepo = fakeGroupsRepo(aGroup());
    const service = createUpdateGroupService({
      groupsRepo,
      entitlements: fakeEntitlements(false),
    });

    await expect(
      service({ groupId: "g1", userId: "u1", patch: { isPublic: true } }),
    ).rejects.toMatchObject({ code: "GRP-T0003", statusCode: 403 });
    expect(groupsRepo.update).not.toHaveBeenCalled();
  });

  it("applies the patch when the owner has the public_groups feature", async () => {
    const entitlements = fakeEntitlements(true);
    const groupsRepo = fakeGroupsRepo(aGroup());
    const service = createUpdateGroupService({ groupsRepo, entitlements });

    const result = await service({
      groupId: "g1",
      userId: "u1",
      patch: { isPublic: true, joinPolicy: "request" },
    });

    expect(entitlements.hasFeature).toHaveBeenCalledWith("u1", "public_groups");
    expect(groupsRepo.update).toHaveBeenCalledWith("g1", {
      isPublic: true,
      joinPolicy: "request",
    });
    expect(result).toMatchObject({ isPublic: true, joinPolicy: "request" });
  });

  it("does not gate a patch that only changes joinPolicy (isPublic left untouched)", async () => {
    const entitlements = fakeEntitlements(false);
    const service = createUpdateGroupService({
      groupsRepo: fakeGroupsRepo(aGroup({ isPublic: true })),
      entitlements,
    });

    await expect(
      service({ groupId: "g1", userId: "u1", patch: { joinPolicy: "request" } }),
    ).resolves.toBeDefined();
    expect(entitlements.hasFeature).not.toHaveBeenCalled();
  });

  it("does not gate turning a group private (isPublic=false)", async () => {
    const entitlements = fakeEntitlements(false);
    const service = createUpdateGroupService({
      groupsRepo: fakeGroupsRepo(aGroup({ isPublic: true })),
      entitlements,
    });

    await expect(
      service({ groupId: "g1", userId: "u1", patch: { isPublic: false } }),
    ).resolves.toBeDefined();
    expect(entitlements.hasFeature).not.toHaveBeenCalled();
  });

  it("throws GRP-T0002 for a non-owner before any entitlement check", async () => {
    const entitlements = fakeEntitlements(true);
    const service = createUpdateGroupService({
      groupsRepo: fakeGroupsRepo(aGroup({ ownerId: "someone-else" })),
      entitlements,
    });

    await expect(
      service({ groupId: "g1", userId: "u1", patch: { isPublic: true } }),
    ).rejects.toMatchObject({ code: "GRP-T0002" });
    expect(entitlements.hasFeature).not.toHaveBeenCalled();
  });
});
