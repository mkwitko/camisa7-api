import { describe, expect, it, vi } from "vitest";
import type { AttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import type { Attendance } from "@/http/api/matches/children/attendance/attendance.types";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import type { Player } from "@/http/api/players/players.types";
import type { ReputationRepository } from "../reputation.repository";
import { createSetReputationService } from "./set-reputation.service";

const VOTER_USER = "user-voter";
const OTHER_USER = "user-other";

const NOW = new Date("2026-01-10T12:00:00.000Z");
const MATCH_DATETIME = new Date("2026-01-08T12:00:00.000Z"); // finished 48h before NOW exactly at the edge

const aMatch = (overrides: Partial<Match> = {}): Match =>
  ({
    id: "m1",
    groupId: "g1",
    seriesId: null,
    detached: false,
    datetime: MATCH_DATETIME.toISOString(),
    location: "Quadra",
    priceCents: 0,
    slots: 10,
    pixKey: null,
    status: "finished",
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
const CANDIDATE_PLAYER = aPlayer({ id: "p-candidate", userId: "user-candidate" });

function fakeMatchesRepo(match: Match | null): MatchesRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchesRepository;
}

function fakeAttendanceRepo(attendances: Attendance[]): AttendanceRepository {
  return { listByMatch: vi.fn().mockResolvedValue(attendances) } as unknown as AttendanceRepository;
}

function fakeReputationRepo(overrides: Partial<ReputationRepository> = {}): ReputationRepository {
  return {
    replaceForVoter: vi.fn().mockResolvedValue(undefined),
    listByVoter: vi.fn().mockResolvedValue([]),
    countsByPlayer: vi.fn(),
    ...overrides,
  } as unknown as ReputationRepository;
}

type Deps = Parameters<typeof createSetReputationService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    matchesRepo: fakeMatchesRepo(aMatch()),
    attendanceRepo: fakeAttendanceRepo([anAttendance(VOTER_PLAYER), anAttendance(CANDIDATE_PLAYER)]),
    reputationRepo: fakeReputationRepo(),
    now: () => NOW,
    ...over,
  };
}

describe("createSetReputationService", () => {
  it("throws MTC-T0001 when the match doesn't exist", async () => {
    const svc = createSetReputationService(buildDeps({ matchesRepo: fakeMatchesRepo(null) }));
    await expect(
      svc({ matchId: "m1", userId: VOTER_USER, tags: [] }),
    ).rejects.toMatchObject({ code: "MTC-T0001" });
  });

  it("throws VOTE-T0001 (not participant) when the caller isn't a confirmed attendee", async () => {
    const svc = createSetReputationService(buildDeps());
    await expect(
      svc({ matchId: "m1", userId: OTHER_USER, tags: [] }),
    ).rejects.toMatchObject({ code: "VOTE-T0001", statusCode: 403 });
  });

  it("throws VOTE-T0002 (invalid candidate) when a votedPlayerId isn't a confirmed attendee", async () => {
    const svc = createSetReputationService(buildDeps());
    await expect(
      svc({
        matchId: "m1",
        userId: VOTER_USER,
        tags: [{ votedPlayerId: "not-in-match", dimensions: ["pontualidade"] }],
      }),
    ).rejects.toMatchObject({ code: "VOTE-T0002", statusCode: 400 });
  });

  it("throws VOTE-T0003 (self-tag) when votedPlayerId === caller's playerId", async () => {
    const svc = createSetReputationService(buildDeps());
    await expect(
      svc({
        matchId: "m1",
        userId: VOTER_USER,
        tags: [{ votedPlayerId: VOTER_PLAYER.id, dimensions: ["pontualidade"] }],
      }),
    ).rejects.toMatchObject({ code: "VOTE-T0003", statusCode: 400 });
  });

  it("throws VOTE-T0004 (window closed) when the match isn't finished", async () => {
    const svc = createSetReputationService(
      buildDeps({ matchesRepo: fakeMatchesRepo(aMatch({ status: "open" })) }),
    );
    await expect(
      svc({ matchId: "m1", userId: VOTER_USER, tags: [] }),
    ).rejects.toMatchObject({ code: "VOTE-T0004", statusCode: 409 });
  });

  it("throws VOTE-T0004 (window closed) when outside the 48h window", async () => {
    const svc = createSetReputationService(
      buildDeps({ now: () => new Date(MATCH_DATETIME.getTime() + 48 * 60 * 60 * 1000 + 1) }),
    );
    await expect(
      svc({ matchId: "m1", userId: VOTER_USER, tags: [] }),
    ).rejects.toMatchObject({ code: "VOTE-T0004", statusCode: 409 });
  });

  it("replaces the caller's tag set when all rules pass", async () => {
    const replaceForVoter = vi.fn().mockResolvedValue(undefined);
    const svc = createSetReputationService(
      buildDeps({ reputationRepo: fakeReputationRepo({ replaceForVoter }) }),
    );

    await svc({
      matchId: "m1",
      userId: VOTER_USER,
      tags: [{ votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade"] }],
    });

    expect(replaceForVoter).toHaveBeenCalledWith("m1", VOTER_PLAYER.id, [
      { votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade"] },
    ]);
  });

  it("dedups a duplicate dimension within the same tag before storing (no P2002)", async () => {
    const replaceForVoter = vi.fn().mockResolvedValue(undefined);
    const svc = createSetReputationService(
      buildDeps({ reputationRepo: fakeReputationRepo({ replaceForVoter }) }),
    );

    await svc({
      matchId: "m1",
      userId: VOTER_USER,
      tags: [
        {
          votedPlayerId: CANDIDATE_PLAYER.id,
          dimensions: ["pontualidade", "pontualidade", "respeito"],
        },
      ],
    });

    expect(replaceForVoter).toHaveBeenCalledWith("m1", VOTER_PLAYER.id, [
      { votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade", "respeito"] },
    ]);
  });

  it("merges two tags sharing the same votedPlayerId into one deduped tag (no P2002)", async () => {
    const replaceForVoter = vi.fn().mockResolvedValue(undefined);
    const svc = createSetReputationService(
      buildDeps({ reputationRepo: fakeReputationRepo({ replaceForVoter }) }),
    );

    await expect(
      svc({
        matchId: "m1",
        userId: VOTER_USER,
        tags: [
          { votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade"] },
          { votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade", "respeito"] },
        ],
      }),
    ).resolves.toEqual([{ votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade", "respeito"] }]);

    expect(replaceForVoter).toHaveBeenCalledWith("m1", VOTER_PLAYER.id, [
      { votedPlayerId: CANDIDATE_PLAYER.id, dimensions: ["pontualidade", "respeito"] },
    ]);
  });
});
