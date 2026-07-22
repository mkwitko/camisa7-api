import { describe, expect, it, vi } from "vitest";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";
import { createUpdateMatchService } from "./update-match.service";

const OWNER = "owner-1";

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

const aMatch = (overrides: Partial<Match> = {}): Match =>
  ({
    id: "m1",
    groupId: "g1",
    seriesId: null,
    detached: false,
    datetime: "2026-08-01T20:00:00.000Z",
    location: "Quadra Central",
    priceCents: 0,
    slots: 20,
    pixKey: null,
    status: "open",
    modality: "campo",
    latitude: -23.5,
    longitude: -46.6,
    city: "São Paulo",
    address: "Rua X",
    venueId: null,
    bookingId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }) as Match;

function makeMatchesRepo(match: Match | null): MatchesRepository {
  return {
    findById: vi.fn().mockResolvedValue(match),
    // echoes the patch merged onto the match so the test can assert what was written
    update: vi
      .fn()
      .mockImplementation(async (id: string, patch) => ({ ...aMatch({ id }), ...patch })),
  } as unknown as MatchesRepository;
}

function makeGroupsRepo(group: Group | null): GroupsRepository {
  return { findById: vi.fn().mockResolvedValue(group) } as unknown as GroupsRepository;
}

describe("createUpdateMatchService", () => {
  it("passes modality + geo through to the repository", async () => {
    const matchesRepo = makeMatchesRepo(aMatch());
    const service = createUpdateMatchService({
      matchesRepo,
      groupsRepo: makeGroupsRepo(aGroup()),
    });

    await service({
      matchId: "m1",
      userId: OWNER,
      patch: {
        modality: "futsal",
        latitude: -30.03,
        longitude: -51.21,
        city: "Porto Alegre",
        address: "Av. Ipiranga, 1000",
      },
    });

    expect(matchesRepo.update).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({
        modality: "futsal",
        latitude: -30.03,
        longitude: -51.21,
        city: "Porto Alegre",
        address: "Av. Ipiranga, 1000",
      }),
    );
  });

  it("detaches a still-attached series occurrence when edited", async () => {
    const matchesRepo = makeMatchesRepo(aMatch({ seriesId: "s1", detached: false }));
    const service = createUpdateMatchService({
      matchesRepo,
      groupsRepo: makeGroupsRepo(aGroup()),
    });

    await service({ matchId: "m1", userId: OWNER, patch: { modality: "society" } });

    expect(matchesRepo.update).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ modality: "society", detached: true }),
    );
  });

  it("rejects editing a finished match (MTC-T0002)", async () => {
    const matchesRepo = makeMatchesRepo(aMatch({ status: "finished" }));
    const service = createUpdateMatchService({
      matchesRepo,
      groupsRepo: makeGroupsRepo(aGroup()),
    });

    await expect(
      service({ matchId: "m1", userId: OWNER, patch: { modality: "futsal" } }),
    ).rejects.toMatchObject({ code: "MTC-T0002" });
    expect(matchesRepo.update).not.toHaveBeenCalled();
  });
});
