import { describe, expect, it, vi } from "vitest";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { Attendance } from "@/http/api/matches/children/attendance/attendance.types";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import type { Player } from "@/http/api/players/players.types";
import type { ReputationRepository } from "../reputation.repository";
import type { VoterTag } from "../reputation.types";
import { createGetReputationService } from "./get-reputation.service";

const VOTER_USER = "user-voter";
const OTHER_USER = "user-other";

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

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: VOTER_USER,
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

const VOTER_PLAYER = aPlayer({ id: "p-voter", userId: VOTER_USER });

function fakeMatchesRepo(match: Match | null): MatchesRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchesRepository;
}

function fakeAttendanceRepo(attendances: Attendance[]): AttendanceRepository {
  return { listByMatch: vi.fn().mockResolvedValue(attendances) } as unknown as AttendanceRepository;
}

function fakeReputationRepo(tags: VoterTag[]): ReputationRepository {
  return {
    replaceForVoter: vi.fn(),
    listByVoter: vi.fn().mockResolvedValue(tags),
    countsByPlayer: vi.fn(),
  } as unknown as ReputationRepository;
}

type Deps = Parameters<typeof createGetReputationService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    matchesRepo: fakeMatchesRepo(aMatch()),
    attendanceRepo: fakeAttendanceRepo([anAttendance(VOTER_PLAYER)]),
    reputationRepo: fakeReputationRepo([]),
    ...over,
  };
}

describe("createGetReputationService", () => {
  it("throws MTC-T0001 when the match doesn't exist", async () => {
    const svc = createGetReputationService(buildDeps({ matchesRepo: fakeMatchesRepo(null) }));
    await expect(svc({ matchId: "m1", userId: VOTER_USER })).rejects.toMatchObject({
      code: "MTC-T0001",
    });
  });

  it("throws VOTE-T0001 when the caller isn't a confirmed attendee", async () => {
    const svc = createGetReputationService(buildDeps());
    await expect(svc({ matchId: "m1", userId: OTHER_USER })).rejects.toMatchObject({
      code: "VOTE-T0001",
      statusCode: 403,
    });
  });

  it("returns the caller's own tags from reputationRepo.listByVoter", async () => {
    const tags: VoterTag[] = [{ votedPlayerId: "p-x", dimensions: ["respeito"] }];
    const svc = createGetReputationService(
      buildDeps({ reputationRepo: fakeReputationRepo(tags) }),
    );

    const result = await svc({ matchId: "m1", userId: VOTER_USER });

    expect(result).toEqual(tags);
  });

  it("does not gate on the voting window (unlike set-reputation)", async () => {
    const svc = createGetReputationService(
      buildDeps({ matchesRepo: fakeMatchesRepo(aMatch({ status: "open" })) }),
    );
    await expect(svc({ matchId: "m1", userId: VOTER_USER })).resolves.toEqual([]);
  });
});
