import { describe, expect, it } from "vitest";
import type { PublicProfileResponse } from "@/http/api/players/public-profile/public-profile.schema";
import { renderCarta } from "./carta";

const profile: PublicProfileResponse = {
  playerId: "11111111-1111-4111-8111-111111111111",
  name: "Maurício Silva",
  level: "ouro",
  overallByPosition: { campo_atacante: 84 },
  bestOverall: 84,
  bestPosition: "campo_atacante",
  matchesPlayed: 10,
  wins: 6,
  draws: 2,
  losses: 2,
  winRate: 0.6,
  goals: 12,
  assists: 5,
  cleanSheets: 1,
  mvpCount: 3,
  currentStreak: 2,
  bestStreak: 4,
  achievements: [],
  reputation: { pontualidade: 0, educacao: 0, compromisso: 0, respeito: 0 },
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("renderCarta", () => {
  it("returns a valid PNG buffer", async () => {
    const png = await renderCarta(profile);
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(png.length).toBeGreaterThan(1000);
  });
});
