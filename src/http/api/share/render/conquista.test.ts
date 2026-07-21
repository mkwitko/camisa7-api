import { describe, expect, it } from "vitest";
import type { PublicProfileResponse } from "@/http/api/players/public-profile/public-profile.schema";
import { renderConquista } from "./conquista";

const base = {
  playerId: "11111111-1111-4111-8111-111111111111", name: "Maurício", level: "ouro",
  overallByPosition: {}, bestOverall: 80, bestPosition: null,
  matchesPlayed: 0, wins: 0, draws: 0, losses: 0, winRate: 0,
  goals: 0, assists: 0, cleanSheets: 0, mvpCount: 0, currentStreak: 0, bestStreak: 0,
  reputation: { pontualidade: 0, educacao: 0, compromisso: 0, respeito: 0 },
} as const;
const profile: PublicProfileResponse = {
  ...base,
  achievements: [{ key: "hat_trick", label: "Hat-trick", description: "3 gols numa partida", icon: "⚽", unlocked: true }],
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("renderConquista", () => {
  it("renders an unlocked achievement to PNG", async () => {
    const png = await renderConquista(profile, "hat_trick");
    expect(png.subarray(0, 4)).toEqual(PNG);
  });
  it("rejects an unknown/locked achievement", async () => {
    await expect(renderConquista(profile, "nope")).rejects.toThrow();
  });
});
