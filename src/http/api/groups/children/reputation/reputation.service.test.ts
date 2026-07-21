import { describe, expect, it, vi } from "vitest";
import type { ReputationRepository } from "@/http/api/matches/children/reputation/reputation.repository";
import type { ReputationCounts } from "@/http/api/matches/children/reputation/reputation.types";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import type { GroupsRepository } from "../../groups.repository";
import type { Group } from "../../groups.types";
import type { GroupMember } from "../members/members.types";
import type { MembersRepository } from "../members/members.repository";
import { createGroupReputationService } from "./reputation.service";

const OWNER_USER = "user-owner";
const MEMBER_USER = "user-member";
const OUTSIDER_USER = "user-outsider";

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: OWNER_USER,
  statsMode: "organizador",
  monthlyFeeCents: null,
  isPublic: false,
  joinPolicy: "open",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: MEMBER_USER,
  name: "Player",
  slug: "player-0001",
  phone: null,
  avatarUrl: null,
  affinity: {},
  attributes: {},
  skills: [],
  dominantFoot: null,
  weakFoot: null,
  skillMoves: null,
  heightCm: null,
  weightKg: null,
  birthYear: null,
  preferredTeam: null,
  nationality: null,
  ...overrides,
});

const aMember = (player: Player, overrides: Partial<GroupMember> = {}): GroupMember => ({
  id: `member-${player.id}`,
  groupId: "g1",
  player,
  role: "jogador",
  primaryPos: null,
  secondaryPos: [],
  affinity: {},
  seedOverall: {},
  billingMode: "avulso",
  monthlyFeeCentsOverride: null,
  ...overrides,
});

const MEMBER_PLAYER = aPlayer({ id: "p-member", userId: MEMBER_USER, name: "Member Player" });
const OTHER_PLAYER = aPlayer({ id: "p-other", userId: "user-other-member", name: "Other Player" });
const GROUP_MEMBERS = [aMember(MEMBER_PLAYER), aMember(OTHER_PLAYER)];

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(group),
    update: vi.fn(),
    listOwnedBy: vi.fn(),
    listOwnedByWithMeta: vi.fn(),
  };
}

function fakeMembersRepo(
  members: GroupMember[],
  memberForCaller: GroupMember | null = null,
): MembersRepository {
  return {
    addGuest: vi.fn(),
    addForUser: vi.fn(),
    listByGroup: vi.fn().mockResolvedValue(members),
    findInGroup: vi.fn(),
    findByGroupAndPlayer: vi.fn().mockResolvedValue(memberForCaller),
    updateRating: vi.fn(),
    isUserInGroup: vi.fn(),
  };
}

function fakePlayersRepo(player: Player): PlayersRepository {
  return {
    findOrCreateForUser: vi.fn().mockResolvedValue(player),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    createGuest: vi.fn(),
    updateProfile: vi.fn(),
    searchByName: vi.fn(),
  };
}

function fakeReputationRepo(countsByPlayerId: Record<string, ReputationCounts>): ReputationRepository {
  return {
    replaceForVoter: vi.fn(),
    listByVoter: vi.fn(),
    countsByPlayer: vi.fn().mockImplementation(async (playerId: string) => countsByPlayerId[playerId]),
  };
}

const COUNTS_MEMBER: ReputationCounts = { pontualidade: 3, educacao: 2, compromisso: 1, respeito: 0 };
const COUNTS_OTHER: ReputationCounts = { pontualidade: 0, educacao: 0, compromisso: 0, respeito: 4 };

describe("createGroupReputationService", () => {
  it("throws GRP-T0001 (conceal) when the group doesn't exist", async () => {
    const service = createGroupReputationService({
      groupsRepo: fakeGroupsRepo(null),
      membersRepo: fakeMembersRepo(GROUP_MEMBERS),
      playersRepo: fakePlayersRepo(MEMBER_PLAYER),
      reputationRepo: fakeReputationRepo({}),
    });

    await expect(service("g1", OUTSIDER_USER)).rejects.toMatchObject({
      code: "GRP-T0001",
      statusCode: 404,
    });
  });

  it("throws GRP-T0001 (conceal) for a caller with no membership in the group", async () => {
    const service = createGroupReputationService({
      groupsRepo: fakeGroupsRepo(aGroup()),
      membersRepo: fakeMembersRepo(GROUP_MEMBERS, null),
      playersRepo: fakePlayersRepo(aPlayer({ id: "p-outsider", userId: OUTSIDER_USER })),
      reputationRepo: fakeReputationRepo({}),
    });

    await expect(service("g1", OUTSIDER_USER)).rejects.toMatchObject({
      code: "GRP-T0001",
      statusCode: 404,
    });
  });

  it("returns every member's per-dimension counts for the owner", async () => {
    const service = createGroupReputationService({
      groupsRepo: fakeGroupsRepo(aGroup({ ownerId: OWNER_USER })),
      membersRepo: fakeMembersRepo(GROUP_MEMBERS),
      playersRepo: fakePlayersRepo(MEMBER_PLAYER),
      reputationRepo: fakeReputationRepo({
        "p-member": COUNTS_MEMBER,
        "p-other": COUNTS_OTHER,
      }),
    });

    const result = await service("g1", OWNER_USER);

    expect(result).toEqual([
      { playerId: "p-member", name: "Member Player", reputation: COUNTS_MEMBER },
      { playerId: "p-other", name: "Other Player", reputation: COUNTS_OTHER },
    ]);
  });

  it("returns every member's per-dimension counts for a non-owner member", async () => {
    const callerMember = aMember(MEMBER_PLAYER);
    const service = createGroupReputationService({
      groupsRepo: fakeGroupsRepo(aGroup({ ownerId: OWNER_USER })),
      membersRepo: fakeMembersRepo(GROUP_MEMBERS, callerMember),
      playersRepo: fakePlayersRepo(MEMBER_PLAYER),
      reputationRepo: fakeReputationRepo({
        "p-member": COUNTS_MEMBER,
        "p-other": COUNTS_OTHER,
      }),
    });

    const result = await service("g1", MEMBER_USER);

    expect(result).toEqual([
      { playerId: "p-member", name: "Member Player", reputation: COUNTS_MEMBER },
      { playerId: "p-other", name: "Other Player", reputation: COUNTS_OTHER },
    ]);
  });
});
