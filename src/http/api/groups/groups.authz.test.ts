import { describe, expect, it } from "vitest";
import { assertGroupOwner } from "./groups.authz";
import type { Group } from "./groups.types";

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Test Group",
  ownerId: "u1",
  statsMode: "organizador",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("assertGroupOwner", () => {
  it("throws GRP-T0001 when group is null", () => {
    let thrown: unknown;
    try {
      assertGroupOwner(null, "u1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "GRP-T0001" });
  });

  it("throws GRP-T0002 when group.ownerId does not match userId", () => {
    const group = aGroup({ ownerId: "u2" });
    let thrown: unknown;
    try {
      assertGroupOwner(group, "u1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "GRP-T0002" });
  });

  it("returns the group when group.ownerId matches userId", () => {
    const group = aGroup({ ownerId: "u1" });

    const result = assertGroupOwner(group, "u1");

    expect(result).toEqual(group);
  });
});
