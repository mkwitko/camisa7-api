import { describe, expect, it } from "vitest";
import { remapLegacyPositions } from "./players.remap";

describe("remapLegacyPositions", () => {
  it("maps legacy keys to campo_* slugs", () => {
    expect(remapLegacyPositions({ goleiro: 90, meia: 50, atacante: 70, volante: 40 })).toEqual({
      campo_goleiro: 90,
      campo_meia: 50,
      campo_atacante: 70,
      campo_volante: 40,
    });
  });

  it("maps zagueiro and lateral to their own campo slots", () => {
    expect(remapLegacyPositions({ zagueiro: 60, lateral: 80 })).toEqual({
      campo_zagueiro: 60,
      campo_lateral_dir: 80,
    });
  });

  it("passes through already-migrated slugs untouched", () => {
    expect(remapLegacyPositions({ campo_atacante: 55 })).toEqual({ campo_atacante: 55 });
  });
});
