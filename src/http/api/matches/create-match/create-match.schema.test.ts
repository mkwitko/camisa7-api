import { describe, expect, it } from "vitest";
import { CreateMatchBody } from "./create-match.schema";

const base = { datetime: "2026-08-01T20:00:00.000Z", location: "Quadra", slots: 10 };

describe("CreateMatchBody.modality", () => {
  it("accepts a valid modality", () => {
    expect(CreateMatchBody.safeParse({ ...base, modality: "futsal" }).success).toBe(true);
  });

  it("requires modality", () => {
    expect(CreateMatchBody.safeParse(base).success).toBe(false);
  });

  it("rejects an unknown modality", () => {
    expect(CreateMatchBody.safeParse({ ...base, modality: "beach" }).success).toBe(false);
  });
});
