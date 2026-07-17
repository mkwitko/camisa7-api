import { describe, expect, it, vi } from "vitest";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import { createMyPlayerService, createUpdateMyPlayerService } from "./me.service";

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  userId: "u1",
  name: "Real Rafa",
  phone: null,
  affinity: {},
  attributes: {
    chute: 50,
    passe: 50,
    drible: 50,
    velocidade: 50,
    forca: 50,
    cabeceio: 50,
    marcacao: 50,
    desarme: 50,
    visao: 50,
    lideranca: 50,
  },
  skills: [],
  ...overrides,
});

function makeFakeRepo(overrides: Partial<PlayersRepository> = {}): PlayersRepository {
  return {
    findById: vi.fn(),
    createGuest: vi.fn(),
    findOrCreateForUser: vi.fn(),
    updateProfile: vi.fn(),
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

describe("createUpdateMyPlayerService", () => {
  it("resolves the caller's player then overwrites the given profile fields", async () => {
    const player = aPlayer();
    const updated = aPlayer({ affinity: { campo_atacante: 80 }, skills: ["goleador"] });
    const playersRepo = makeFakeRepo({
      findOrCreateForUser: vi.fn().mockResolvedValue(player),
      updateProfile: vi.fn().mockResolvedValue(updated),
    });
    const service = createUpdateMyPlayerService({ playersRepo });

    const patch = { affinity: { campo_atacante: 80 }, skills: ["goleador"] };
    await expect(service("u1", patch)).resolves.toEqual(updated);
    expect(playersRepo.findOrCreateForUser).toHaveBeenCalledWith("u1");
    expect(playersRepo.updateProfile).toHaveBeenCalledWith("p1", patch);
  });
});
