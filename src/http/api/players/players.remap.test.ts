import { describe, expect, it } from "vitest";
import { remapLegacyPositions } from "./players.remap";

describe("remapLegacyPositions", () => {
  it("maps legacy keys to campo_* slugs", () => {
    expect(remapLegacyPositions({ goleiro: 90, meia: 50, atacante: 70, volante: 40 })).toEqual({
      campo_goleiro: 90,
      campo_meia: 50,
      campo_atacante: 70,
      campo_ala_volante: 40,
    });
  });

  it("collapses lateral + zagueiro into campo_lateral keeping the max", () => {
    expect(remapLegacyPositions({ zagueiro: 60, lateral: 80 })).toEqual({ campo_lateral: 80 });
    expect(remapLegacyPositions({ zagueiro: 90, lateral: 70 })).toEqual({ campo_lateral: 90 });
  });

  it("passes through already-migrated slugs untouched", () => {
    expect(remapLegacyPositions({ campo_atacante: 55 })).toEqual({ campo_atacante: 55 });
  });
});
