import { describe, expect, it } from "vitest";
import { renderRanking } from "./ranking";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("renderRanking", () => {
  it("renders a ranking position card to PNG", async () => {
    const png = await renderRanking({
      groupName: "Pelada da Quinta", playerName: "Maurício", rank: 1, category: "Artilheiro", value: 12,
    });
    expect(png.subarray(0, 4)).toEqual(PNG);
  });
});
