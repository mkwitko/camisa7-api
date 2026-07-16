import { describe, expect, it, vi } from "vitest";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import { createMyPlayerService } from "./me.service";

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: "u1",
  name: "Real Rafa",
  phone: null,
  affinity: {},
  ...overrides,
});

function makeFakeRepo(overrides: Partial<PlayersRepository> = {}): PlayersRepository {
  return {
    findById: vi.fn(),
    createGuest: vi.fn(),
    findOrCreateForUser: vi.fn(),
    ...overrides,
  };
}

describe("createMyPlayerService", () => {
  it("delegates to findOrCreateForUser and returns the caller's canonical player", async () => {
    const player = aPlayer();
    const playersRepo = makeFakeRepo({
      findOrCreateForUser: vi.fn().mockResolvedValue(player),
    });
    const service = createMyPlayerService({ playersRepo });

    await expect(service("u1")).resolves.toEqual(player);
    expect(playersRepo.findOrCreateForUser).toHaveBeenCalledWith("u1");
  });
});
