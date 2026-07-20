import { describe, expect, it, vi } from "vitest";
import type { PushGateway } from "@/gateways/push/push.gateway";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import type { AttendanceRepository } from "../attendance/attendance.repository";
import type { JoinRequestRepository } from "./join-request.repository";
import { createJoinRequestService } from "./join-request.service";
import type { JoinRequest } from "./join-request.types";

const OWNER = "owner-1";
const REQUESTER = "user-2";

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
    latitude: -23,
    longitude: -46,
    city: "SP",
    address: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as Match;

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: OWNER,
  statsMode: "organizador",
  monthlyFeeCents: null,
  isPublic: true,
  joinPolicy: "request",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p2",
  userId: REQUESTER,
  name: "Requester",
  slug: "requester-0001",
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

const aRequest = (overrides: Partial<JoinRequest> = {}): JoinRequest => ({
  id: "jr1",
  matchId: "m1",
  playerId: "p2",
  status: "pending",
  decidedById: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function fakeMatchesRepo(match: Match | null): MatchesRepository {
  return { findById: vi.fn().mockResolvedValue(match) } as unknown as MatchesRepository;
}

function fakeGroupsRepo(group: Group | null): GroupsRepository {
  return { findById: vi.fn().mockResolvedValue(group) } as unknown as GroupsRepository;
}

function fakePlayersRepo(player: Player): PlayersRepository {
  return {
    findOrCreateForUser: vi.fn().mockResolvedValue(player),
    findById: vi.fn().mockResolvedValue(player),
  } as unknown as PlayersRepository;
}

function fakeAttendanceRepo(): AttendanceRepository {
  return {
    confirm: vi.fn().mockResolvedValue({ attendance: {} }),
  } as unknown as AttendanceRepository;
}

function fakeAuthRepo(token: string | null): AuthRepository {
  return { getPushToken: vi.fn().mockResolvedValue(token) } as unknown as AuthRepository;
}

function fakePush(): PushGateway {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function fakeJoinRequestRepo(
  overrides: Partial<JoinRequestRepository> = {},
): JoinRequestRepository {
  return {
    create: vi
      .fn()
      .mockImplementation(async (matchId: string, playerId: string) =>
        aRequest({ matchId, playerId }),
      ),
    findByMatchAndPlayer: vi.fn().mockResolvedValue(null),
    reopen: vi.fn().mockImplementation(async (id: string) => aRequest({ id, status: "pending" })),
    listPendingByMatch: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    setStatus: vi
      .fn()
      .mockImplementation(async (id: string, status: JoinRequest["status"], decidedById) =>
        aRequest({ id, status, decidedById }),
      ),
    ...overrides,
  };
}

type Deps = Parameters<typeof createJoinRequestService>[0];

function buildDeps(over: Partial<Deps> = {}): Deps {
  return {
    joinRequestRepo: fakeJoinRequestRepo(),
    playersRepo: fakePlayersRepo(aPlayer()),
    matchesRepo: fakeMatchesRepo(aMatch()),
    groupsRepo: fakeGroupsRepo(aGroup()),
    attendanceRepo: fakeAttendanceRepo(),
    authRepo: fakeAuthRepo("push-token"),
    push: fakePush(),
    ...over,
  };
}

describe("createJoinRequestService.requestJoin", () => {
  it("throws MTC-T0001 when the match doesn't exist", async () => {
    const svc = createJoinRequestService(buildDeps({ matchesRepo: fakeMatchesRepo(null) }));
    await expect(svc.requestJoin("m1", REQUESTER)).rejects.toMatchObject({ code: "MTC-T0001" });
  });

  it("throws ATT-T0004 (403) for a PRIVATE group", async () => {
    const svc = createJoinRequestService(
      buildDeps({ groupsRepo: fakeGroupsRepo(aGroup({ isPublic: false })) }),
    );
    await expect(svc.requestJoin("m1", REQUESTER)).rejects.toMatchObject({
      code: "ATT-T0004",
      statusCode: 403,
    });
  });

  it("throws JRQ-T0002 (409) for a PUBLIC group with open policy", async () => {
    const svc = createJoinRequestService(
      buildDeps({ groupsRepo: fakeGroupsRepo(aGroup({ joinPolicy: "open" })) }),
    );
    await expect(svc.requestJoin("m1", REQUESTER)).rejects.toMatchObject({
      code: "JRQ-T0002",
      statusCode: 409,
    });
  });

  it("creates a pending request for a public+request group with no prior request", async () => {
    const joinRequestRepo = fakeJoinRequestRepo();
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));

    const result = await svc.requestJoin("m1", REQUESTER);

    expect(joinRequestRepo.create).toHaveBeenCalledWith("m1", "p2");
    expect(result.status).toBe("pending");
  });

  it("throws JRQ-T0001 when a pending request already exists", async () => {
    const joinRequestRepo = fakeJoinRequestRepo({
      findByMatchAndPlayer: vi.fn().mockResolvedValue(aRequest({ status: "pending" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));

    await expect(svc.requestJoin("m1", REQUESTER)).rejects.toMatchObject({ code: "JRQ-T0001" });
    expect(joinRequestRepo.create).not.toHaveBeenCalled();
  });

  it("throws JRQ-T0001 when an approved request already exists", async () => {
    const joinRequestRepo = fakeJoinRequestRepo({
      findByMatchAndPlayer: vi.fn().mockResolvedValue(aRequest({ status: "approved" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));

    await expect(svc.requestJoin("m1", REQUESTER)).rejects.toMatchObject({ code: "JRQ-T0001" });
  });

  it("reopens a previously rejected request instead of creating a second row", async () => {
    const joinRequestRepo = fakeJoinRequestRepo({
      findByMatchAndPlayer: vi.fn().mockResolvedValue(aRequest({ id: "jr9", status: "rejected" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));

    const result = await svc.requestJoin("m1", REQUESTER);

    expect(joinRequestRepo.reopen).toHaveBeenCalledWith("jr9");
    expect(joinRequestRepo.create).not.toHaveBeenCalled();
    expect(result.status).toBe("pending");
  });
});

describe("createJoinRequestService.listRequests", () => {
  it("throws GRP-T0002 for a non-owner", async () => {
    const svc = createJoinRequestService(buildDeps());
    await expect(svc.listRequests("m1", "not-the-owner")).rejects.toMatchObject({
      code: "GRP-T0002",
    });
  });

  it("returns the pending inbox for the owner", async () => {
    const pending = [
      { id: "jr1", matchId: "m1", playerId: "p2", playerName: "Zé", createdAt: "2026-01-01" },
    ];
    const joinRequestRepo = fakeJoinRequestRepo({
      listPendingByMatch: vi.fn().mockResolvedValue(pending),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));

    await expect(svc.listRequests("m1", OWNER)).resolves.toEqual(pending);
  });
});

describe("createJoinRequestService.decide", () => {
  it("throws GRP-T0002 for a non-owner", async () => {
    const svc = createJoinRequestService(buildDeps());
    await expect(svc.decide("m1", "jr1", "not-the-owner", true)).rejects.toMatchObject({
      code: "GRP-T0002",
    });
  });

  it("throws JRQ-T0003 when the request doesn't belong to the match", async () => {
    const joinRequestRepo = fakeJoinRequestRepo({
      findById: vi.fn().mockResolvedValue(aRequest({ matchId: "other-match" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));
    await expect(svc.decide("m1", "jr1", OWNER, true)).rejects.toMatchObject({ code: "JRQ-T0003" });
  });

  it("throws JRQ-T0004 when the request was already decided", async () => {
    const joinRequestRepo = fakeJoinRequestRepo({
      findById: vi.fn().mockResolvedValue(aRequest({ status: "approved" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo }));
    await expect(svc.decide("m1", "jr1", OWNER, true)).rejects.toMatchObject({ code: "JRQ-T0004" });
  });

  it("approve: confirms the requester, marks approved, and pushes", async () => {
    const attendanceRepo = fakeAttendanceRepo();
    const authRepo = fakeAuthRepo("tok-123");
    const push = fakePush();
    const joinRequestRepo = fakeJoinRequestRepo({
      findById: vi.fn().mockResolvedValue(aRequest({ status: "pending" })),
    });
    const svc = createJoinRequestService(
      buildDeps({ joinRequestRepo, attendanceRepo, authRepo, push }),
    );

    const result = await svc.decide("m1", "jr1", OWNER, true);

    expect(attendanceRepo.confirm).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ id: "p2" }),
    );
    expect(joinRequestRepo.setStatus).toHaveBeenCalledWith("jr1", "approved", OWNER);
    expect(push.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "tok-123", data: { type: "join_approved", matchId: "m1" } }),
    );
    expect(result.status).toBe("approved");
  });

  it("approve: skips the push when the requester has no linked user", async () => {
    const push = fakePush();
    const joinRequestRepo = fakeJoinRequestRepo({
      findById: vi.fn().mockResolvedValue(aRequest({ status: "pending" })),
    });
    const svc = createJoinRequestService(
      buildDeps({
        joinRequestRepo,
        playersRepo: fakePlayersRepo(aPlayer({ userId: null })),
        push,
      }),
    );

    await svc.decide("m1", "jr1", OWNER, true);
    expect(push.send).not.toHaveBeenCalled();
  });

  it("reject: marks rejected without confirming or pushing", async () => {
    const attendanceRepo = fakeAttendanceRepo();
    const push = fakePush();
    const joinRequestRepo = fakeJoinRequestRepo({
      findById: vi.fn().mockResolvedValue(aRequest({ status: "pending" })),
    });
    const svc = createJoinRequestService(buildDeps({ joinRequestRepo, attendanceRepo, push }));

    const result = await svc.decide("m1", "jr1", OWNER, false);

    expect(joinRequestRepo.setStatus).toHaveBeenCalledWith("jr1", "rejected", OWNER);
    expect(attendanceRepo.confirm).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(result.status).toBe("rejected");
  });
});
