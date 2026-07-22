import { describe, expect, it, vi } from "vitest";
import type { MembersRepository } from "@/http/api/groups/children/members/members.repository";
import type { GroupMember } from "@/http/api/groups/children/members/members.types";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import type { PlayerCareer } from "@/http/api/players/children/career/career.types";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import { overallByPositionFrom } from "@/http/api/players/players.rating";
import type { Player } from "@/http/api/players/players.types";
import type { AttendanceRepository } from "../../attendance/attendance.repository";
import type { Attendance } from "../../attendance/attendance.types";
import type { TeamsRepository } from "../teams.repository";
import type { TeamAssignment } from "../teams.types";
import { createGenerateTeamsService } from "./generate-teams.service";

const OWNER = "owner-1";

const aMatch = (overrides: Partial<Match> = {}): Match =>
  ({
    id: "m1",
    groupId: "g1",
    seriesId: null,
    detached: false,
    datetime: new Date().toISOString(),
    location: "Quadra",
    priceCents: 0,
    slots: 10,
    pixKey: null,
    status: "open",
    modality: "campo",
    latitude: null,
    longitude: null,
    city: null,
    address: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as Match;

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Group A",
  ownerId: OWNER,
  statsMode: "organizador",
  isPublic: false,
  joinPolicy: "request",
  monthlyFeeCents: null,
  wooviPixKey: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: "u1",
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

const anAttendance = (player: Player, overrides: Partial<Attendance> = {}): Attendance => ({
  id: `att-${player.id}`,
  matchId: "m1",
  player,
  status: "confirmed",
  waitlistPos: null,
  paymentStatus: "pending",
  paidConfirmedById: null,
  ...overrides,
});

const aCareer = (playerId: string, overrides: Partial<PlayerCareer> = {}): PlayerCareer => ({
  id: `career-${playerId}`,
  playerId,
  attributes: withAttributeDefaults({}),
  affinity: {},
  level: "bronze",
  matchesPlayed: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  mvpCount: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function fakeMatchesRepo(match: Match | null): MatchesRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchesRepository;
}

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return { findById: vi.fn().mockResolvedValue(group) } as unknown as GroupsRepository;
}

function fakeAttendanceRepo(attendances: Attendance[]): AttendanceRepository {
  return { listByMatch: vi.fn().mockResolvedValue(attendances) } as unknown as AttendanceRepository;
}

function fakeMembersRepo(members: GroupMember[] = []): MembersRepository {
  return { listByGroup: vi.fn().mockResolvedValue(members) } as unknown as MembersRepository;
}

function fakeCareerRepo(byPlayerId: Record<string, PlayerCareer | null>): PlayerCareerRepository {
  return {
    findByPlayer: vi
      .fn()
      .mockImplementation(async (playerId: string) => byPlayerId[playerId] ?? null),
  } as unknown as PlayerCareerRepository;
}

function fakeTeamsRepo(): TeamsRepository {
  return {
    save: vi.fn().mockImplementation(async (matchId, teams) => {
      const assignment: TeamAssignment = { matchId, teams, generatedAt: new Date().toISOString() };
      return assignment;
    }),
    findByMatch: vi.fn(),
  } as unknown as TeamsRepository;
}

type Deps = Parameters<typeof createGenerateTeamsService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    matchesRepo: fakeMatchesRepo(aMatch()),
    groupsRepo: fakeGroupsRepo(aGroup()),
    attendanceRepo: fakeAttendanceRepo([]),
    membersRepo: fakeMembersRepo(),
    teamsRepo: fakeTeamsRepo(),
    careerRepo: fakeCareerRepo({}),
    ...over,
  };
}

describe("createGenerateTeamsService", () => {
  it("rates each confirmed player via overallByPositionFrom(career.attributes, career.affinity), not a raw affinity clamp", async () => {
    const p1 = aPlayer({ id: "p1", userId: "u1", affinity: { campo_atacante: 60 } });
    const p2 = aPlayer({
      id: "p2",
      userId: "u2",
      name: "Player 2",
      slug: "player-2-0001",
      affinity: { campo_zagueiro: 40 },
    });

    // p1's evolved attributes (all `finalizacao` sub-attributes maxed) push
    // `campo_atacante`'s derived overall well away from a raw affinity clamp
    // — proving the balancer really reads the evolved `attributes`, not the
    // (removed) `career.overall` field or the raw declared affinity.
    const p1Attributes = withAttributeDefaults({
      posicionamento: 99,
      finalizacao: 99,
      forca_chute: 99,
      chute_longe: 99,
      voleio: 99,
      penalti: 99,
    });
    // Deliberately DIFFERENT from p1's own `affinity` (60) above: the service
    // reads two distinct affinity sources — `affinityFor(player.affinity,
    // member.affinity)` (which position `resolveOverall` selects) vs
    // `career.affinity` (fed into `overallByPositionFrom` for the effective
    // value) — so this fixture must keep them apart or a regression that
    // swapped the two sources in the `overallByPositionFrom` call would go
    // undetected (both would still land on the same expected number).
    const p1Career = aCareer("p1", { attributes: p1Attributes, affinity: { campo_atacante: 45 } });

    const p2Attributes = withAttributeDefaults({
      interceptacao: 90,
      cabeceio_def: 90,
      nocao_def: 90,
      dividida: 90,
      carrinho: 90,
    });
    const p2Career = aCareer("p2", { attributes: p2Attributes, affinity: { campo_zagueiro: 40 } });

    // Derived independently from the same shared helper the service now
    // calls — this is the "don't hand-fudge" derivation the task calls for:
    // `overallByPositionFrom` is exhaustively unit-tested on its own
    // (`players.rating.test.ts`); this test's job is to prove the service
    // WIRES career attributes/affinity into it correctly, not to duplicate
    // its arithmetic.
    const expectedP1Overall = overallByPositionFrom(p1Attributes, p1Career.affinity).campo_atacante;
    const expectedP2Overall = overallByPositionFrom(p2Attributes, p2Career.affinity).campo_zagueiro;
    expect(expectedP1Overall).toBeTypeOf("number");
    expect(expectedP2Overall).toBeTypeOf("number");
    // Sanity: proves this scenario actually distinguishes the new
    // attributes-driven derivation from the old raw-affinity clamp (which
    // would have produced exactly 60 here) — otherwise the assertions below
    // could pass by coincidence even if the service still read raw affinity.
    expect(expectedP1Overall).not.toBe(60);
    // Discriminates WHICH affinity source feeds `overallByPositionFrom`: if
    // the service accidentally passed p1's own declared `affinity` (60,
    // used for `resolveOverall`'s position selection) instead of
    // `career.affinity` (45) into that call, it would produce this value
    // instead — proving the two fixtures being different values is load-
    // bearing for this test, not incidental.
    const overallIfPlayerAffinityWereUsedInstead = overallByPositionFrom(
      p1Attributes,
      p1.affinity,
    ).campo_atacante;
    expect(expectedP1Overall).not.toBe(overallIfPlayerAffinityWereUsedInstead);

    const deps = buildDeps({
      attendanceRepo: fakeAttendanceRepo([anAttendance(p1), anAttendance(p2)]),
      careerRepo: fakeCareerRepo({ p1: p1Career, p2: p2Career }),
    });

    const result = await createGenerateTeamsService(deps)({
      matchId: "m1",
      userId: OWNER,
      teamCount: 2,
    });

    const allPlayers = result.teams.flatMap((t) => t.players);
    expect(allPlayers.find((p) => p.playerId === "p1")?.overall).toBe(expectedP1Overall);
    expect(allPlayers.find((p) => p.playerId === "p2")?.overall).toBe(expectedP2Overall);
    for (const team of result.teams) {
      expect(team.overallTotal).toBe(team.players.reduce((sum, p) => sum + p.overall, 0));
    }
  });

  it("falls back to the raw-affinity bootstrap when the player has no PlayerCareer row yet", async () => {
    const p1 = aPlayer({ id: "p1", userId: "u1", affinity: { campo_atacante: 70 } });
    const p2 = aPlayer({
      id: "p2",
      userId: "u2",
      name: "Player 2",
      slug: "player-2-0001",
      affinity: { campo_zagueiro: 55 },
    });

    const deps = buildDeps({
      attendanceRepo: fakeAttendanceRepo([anAttendance(p1), anAttendance(p2)]),
      careerRepo: fakeCareerRepo({}), // no PlayerCareer row for either player
    });

    const result = await createGenerateTeamsService(deps)({
      matchId: "m1",
      userId: OWNER,
      teamCount: 2,
    });

    const allPlayers = result.teams.flatMap((t) => t.players);
    expect(allPlayers.find((p) => p.playerId === "p1")?.overall).toBe(70);
    expect(allPlayers.find((p) => p.playerId === "p2")?.overall).toBe(55);
  });

  it("random mode assigns every confirmed player exactly once across teams", async () => {
    const players = [
      aPlayer({ id: "p1", userId: "u1", slug: "player-1-0001" }),
      aPlayer({ id: "p2", userId: "u2", name: "Player 2", slug: "player-2-0001" }),
      aPlayer({ id: "p3", userId: "u3", name: "Player 3", slug: "player-3-0001" }),
      aPlayer({ id: "p4", userId: "u4", name: "Player 4", slug: "player-4-0001" }),
    ];
    const deps = buildDeps({
      attendanceRepo: fakeAttendanceRepo(players.map((p) => anAttendance(p))),
    });

    const result = await createGenerateTeamsService(deps)({
      matchId: "m1",
      userId: OWNER,
      teamCount: 2,
      mode: "random",
    });

    const ids = result.teams.flatMap((t) => t.players.map((p) => p.playerId)).sort();
    expect(ids).toEqual(["p1", "p2", "p3", "p4"]);
    const sizes = result.teams.map((t) => t.players.length).sort();
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("defaults to balanced mode when mode is omitted (back-compat)", async () => {
    const players = [
      aPlayer({ id: "p1", userId: "u1", slug: "player-1-0001" }),
      aPlayer({ id: "p2", userId: "u2", name: "Player 2", slug: "player-2-0001" }),
      aPlayer({ id: "p3", userId: "u3", name: "Player 3", slug: "player-3-0001" }),
      aPlayer({ id: "p4", userId: "u4", name: "Player 4", slug: "player-4-0001" }),
    ];
    const deps = buildDeps({
      attendanceRepo: fakeAttendanceRepo(players.map((p) => anAttendance(p))),
    });

    const result = await createGenerateTeamsService(deps)({
      matchId: "m1",
      userId: OWNER,
      teamCount: 2,
    });

    const ids = result.teams.flatMap((t) => t.players.map((p) => p.playerId)).sort();
    expect(ids).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
