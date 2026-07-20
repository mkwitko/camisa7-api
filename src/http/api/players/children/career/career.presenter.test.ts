import { describe, expect, it } from "vitest";
import { overallByPositionFrom } from "@/http/api/players/players.rating";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import { presentPlayerCareer } from "./career.presenter";
import type { Player } from "@/http/api/players/players.types";

const player = {
  id: "p1",
  userId: "u1",
  name: "Ana",
  affinity: { campo_atacante: 100 },
  attributes: withAttributeDefaults({ finalizacao: 90 }),
} as unknown as Player;

describe("presentPlayerCareer overall derivation", () => {
  it("null career → bootstrap overall from player base attributes", () => {
    const res = presentPlayerCareer(player, null);
    expect(res.overall).toEqual(overallByPositionFrom(player.attributes, player.affinity));
    expect(Object.keys(res.overall).length).toBeGreaterThan(0);
  });
});
