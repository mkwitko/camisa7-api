import { describe, expect, it } from "vitest";
import { CreateMatchBody } from "./create-match.schema";

const base = { datetime: "2026-08-01T20:00:00.000Z", location: "Quadra", slots: 10 };

describe("CreateMatchBody.modality", () => {
  it("accepts a valid modality", () => {
    expect(CreateMatchBody.safeParse({ ...base, modality: "futsal" }).success).toBe(true);
  });

  it("defaults modality to campo when omitted", () => {
    const r = CreateMatchBody.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.modality).toBe("campo");
  });

  it("rejects an unknown modality", () => {
    expect(CreateMatchBody.safeParse({ ...base, modality: "beach" }).success).toBe(false);
  });
});

describe("CreateMatchBody geo (G1)", () => {
  it("accepts optional geo fields", () => {
    const r = CreateMatchBody.safeParse({
      ...base,
      modality: "campo",
      latitude: -30.03,
      longitude: -51.21,
      city: "Porto Alegre",
      address: "Quadra X",
    });
    expect(r.success).toBe(true);
  });

  it("is valid without geo fields", () => {
    expect(CreateMatchBody.safeParse(base).success).toBe(true);
  });
});
