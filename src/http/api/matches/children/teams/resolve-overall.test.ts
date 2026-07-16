import { describe, expect, it } from "vitest";
import type { GroupMember } from "@/http/api/groups/children/members/members.types";
import { DEFAULT_OVERALL, DEFAULT_PRIMARY_POS, resolveOverall } from "./resolve-overall";

function aMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: "m1",
    groupId: "g1",
    player: { id: "p1", userId: "u1", name: "Player", phone: null, affinity: {} },
    role: "jogador",
    primaryPos: null,
    secondaryPos: [],
    affinity: {},
    seedOverall: {},
    billingMode: "avulso",
    monthlyFeeCentsOverride: null,
    ...overrides,
  };
}

describe("resolveOverall", () => {
  it("falls back to the full neutral default when member is undefined (no GroupMember row)", () => {
    expect(resolveOverall(undefined)).toEqual({
      primaryPos: DEFAULT_PRIMARY_POS,
      overall: DEFAULT_OVERALL,
    });
  });

  // Task 1 (UX overhaul): `GroupMember.primaryPos` is now nullable — a
  // member added via `add-member` (no rating collected there anymore) has a
  // real row but `primaryPos: null`. `??` must treat that the same as "no
  // row at all", not throw or index `seedOverall` with `null`.
  it("falls back to the neutral default when the member row exists but primaryPos is null", () => {
    const member = aMember({ primaryPos: null, seedOverall: {} });

    expect(resolveOverall(member)).toEqual({
      primaryPos: DEFAULT_PRIMARY_POS,
      overall: DEFAULT_OVERALL,
    });
  });

  it("uses the member's own primaryPos/seedOverall when rated", () => {
    const member = aMember({ primaryPos: "atacante", seedOverall: { atacante: 77 } });

    expect(resolveOverall(member)).toEqual({ primaryPos: "atacante", overall: 77 });
  });

  it("defaults overall to DEFAULT_OVERALL when rated for a different position than seedOverall carries", () => {
    const member = aMember({ primaryPos: "goleiro", seedOverall: { atacante: 77 } });

    expect(resolveOverall(member)).toEqual({ primaryPos: "goleiro", overall: DEFAULT_OVERALL });
  });
});
