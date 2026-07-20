import { describe, expect, it, vi } from "vitest";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { UpcomingMatchesRepository } from "./upcoming-matches.repository";
import { createUpcomingMatchesService } from "./upcoming-matches.service";

const player = {
  id: "p1",
  userId: "u1",
  name: "Rafa",
  slug: "rafa-0001",
  phone: null,
  affinity: {},
  attributes: {} as never,
  skills: [] as never,
};

function fakePlayersRepo(): PlayersRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    createGuest: vi.fn(),
    findOrCreateForUser: vi.fn().mockResolvedValue(player),
    updateProfile: vi.fn(),
    searchByName: vi.fn(),
  };
}

describe("createUpcomingMatchesService", () => {
  it("resolves the caller's player then lists their upcoming matches (limit 20)", async () => {
    const rows = [
      {
        id: "m1",
        groupId: "g1",
        groupName: "Quarta FC",
        datetime: "2026-07-20T22:00:00.000Z",
        location: "Quadra X",
        priceCents: 0,
        slots: 10,
        status: "open" as const,
        seriesId: null,
        attendanceStatus: "confirmed" as const,
      },
    ];
    const playersRepo = fakePlayersRepo();
    const upcomingRepo: UpcomingMatchesRepository = {
      listUpcomingForPlayer: vi.fn().mockResolvedValue(rows),
    };
    const service = createUpcomingMatchesService({ playersRepo, upcomingRepo });
    const now = new Date("2026-07-16T12:00:00.000Z");

    await expect(service("u1", now)).resolves.toEqual(rows);
    expect(playersRepo.findOrCreateForUser).toHaveBeenCalledWith("u1");
    expect(upcomingRepo.listUpcomingForPlayer).toHaveBeenCalledWith("p1", now, 20);
  });
});
