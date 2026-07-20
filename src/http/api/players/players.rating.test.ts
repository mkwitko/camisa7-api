import { describe, expect, it } from "vitest";
import { ATTRIBUTE_BASELINE, withAttributeDefaults } from "./players.catalog";
import { categoryOverall, effectiveBase, generalOverall, positionOverall, overallByPositionFrom, generalOverallFrom } from "./players.rating";

const baseline = withAttributeDefaults({});

describe("categoryOverall", () => {
  it("is the mean of the category's sub-attributes", () => {
    const attrs = { ...baseline, aceleracao: 80, pique: 90 };
    expect(categoryOverall(attrs, "ritmo")).toBe(85);
  });
  it("baseline map yields 50 everywhere", () => {
    expect(categoryOverall(baseline, "finalizacao")).toBe(ATTRIBUTE_BASELINE);
  });
});

describe("positionOverall", () => {
  it("uses the position's category weights (goalkeeper dominates for *_goleiro)", () => {
    // Strong GK attrs only; a keeper position should reflect them, an outfield one ignore them.
    const attrs = {
      ...baseline,
      elasticidade: 90, defesa_mao: 90, reflexo: 90, saida: 90, pos_gol: 90, chute_gol: 90,
    };
    expect(positionOverall(attrs, "campo_goleiro")).toBeGreaterThan(
      positionOverall(attrs, "campo_atacante"),
    );
    // Outfield position ignores GK category entirely → stays at baseline.
    expect(positionOverall(attrs, "campo_atacante")).toBe(ATTRIBUTE_BASELINE);
  });
});

describe("generalOverall", () => {
  it("is the max positionOverall over declared positions", () => {
    const attrs = { ...baseline, finalizacao: 99, posicionamento: 99, forca_chute: 99, chute_longe: 99, voleio: 99, penalti: 99 };
    const g = generalOverall(attrs, ["campo_atacante", "campo_goleiro"]);
    expect(g).toBe(positionOverall(attrs, "campo_atacante"));
  });
  it("is 0 when no position declared", () => {
    expect(generalOverall(baseline, [])).toBe(0);
  });
});

describe("effectiveBase", () => {
  it("scales positionOverall by affinity: Natural=100% keeps it, Fraco=25%≈62%", () => {
    const attrs = baseline; // positionOverall = 50 for any position
    expect(effectiveBase(attrs, "campo_atacante", 100)).toBe(50);
    expect(effectiveBase(attrs, "campo_atacante", 25)).toBe(31); // 50 * (0.5 + 0.125) = 31.25 -> 31
  });
});

describe("overallByPositionFrom / generalOverallFrom", () => {
  const attrs = withAttributeDefaults({ finalizacao: 90, posicionamento: 88 });
  const affinity = { campo_atacante: 100, campo_meia: 50 };

  it("maps each declared position to its effectiveBase", () => {
    const map = overallByPositionFrom(attrs, affinity);
    expect(map.campo_atacante).toBe(effectiveBase(attrs, "campo_atacante", 100));
    expect(map.campo_meia).toBe(effectiveBase(attrs, "campo_meia", 50));
  });

  it("ignores keys that are not real positions", () => {
    const map = overallByPositionFrom(attrs, { not_a_pos: 100, campo_atacante: 100 });
    expect(Object.keys(map)).toEqual(["campo_atacante"]);
  });

  it("generalOverallFrom returns the highest declared position overall", () => {
    expect(generalOverallFrom(attrs, affinity)).toBe(
      Math.max(effectiveBase(attrs, "campo_atacante", 100), effectiveBase(attrs, "campo_meia", 50)),
    );
  });

  it("returns 0 / empty when no positions declared", () => {
    expect(generalOverallFrom(attrs, {})).toBe(0);
    expect(overallByPositionFrom(attrs, {})).toEqual({});
  });
});
