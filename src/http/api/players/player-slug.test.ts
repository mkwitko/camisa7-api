import { describe, expect, it } from "vitest";
import { generateSlug, slugifyName } from "./player-slug";

describe("slugifyName", () => {
  it("lowercases, strips accents, hyphenates", () => {
    expect(slugifyName("Maurício Silva")).toBe("mauricio-silva");
  });
  it("collapses non-alphanumerics and trims hyphens", () => {
    expect(slugifyName("  João   da Silva!! ")).toBe("joao-da-silva");
  });
  it("falls back to 'jogador' when empty after stripping", () => {
    expect(slugifyName("!!!")).toBe("jogador");
  });
});

describe("generateSlug", () => {
  it("appends a 4-hex suffix from the injected source", () => {
    expect(generateSlug("Maurício", () => "9f3a")).toBe("mauricio-9f3a");
  });
});
