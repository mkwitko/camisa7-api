import { describe, expect, it } from "vitest";
import type { PlayerCareer } from "@/http/api/players/children/career/career.types";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import { generalOverallFrom } from "@/http/api/players/players.rating";
import type { Player } from "@/http/api/players/players.types";
import { presentMyPlayer } from "./me.presenter";

const player = {
  id: "p1",
  userId: "u1",
  name: "Ana",
  slug: "ana",
  phone: null,
  avatarUrl: null,
  affinity: { campo_atacante: 100 },
  attributes: withAttributeDefaults({ finalizacao: 60 }),
  skills: [],
  dominantFoot: null,
  weakFoot: null,
  skillMoves: null,
  heightCm: null,
  weightKg: null,
  birthYear: null,
  preferredTeam: null,
  nationality: null,
} as unknown as Player;

describe("presentMyPlayer with evolved attributes", () => {
  it("generalOverall uses evolved career attributes, not base", () => {
    const evolved = withAttributeDefaults({ finalizacao: 99, posicionamento: 99, forca_chute: 99 });
    const career = { attributes: evolved, affinity: player.affinity } as unknown as PlayerCareer;
    const res = presentMyPlayer(player, career);
    expect(res.generalOverall).toBe(generalOverallFrom(evolved, player.affinity));
    // base attributes still exposed for the editor.
    expect(res.attributes.finalizacao).toBe(60);
  });

  it("falls back to base when no career", () => {
    const res = presentMyPlayer(player, null);
    expect(res.generalOverall).toBe(generalOverallFrom(player.attributes, player.affinity));
  });
});
