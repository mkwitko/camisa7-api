import { describe, expect, it } from "vitest";
import { MeLocationBody } from "./me-location.schema";

describe("MeLocationBody", () => {
  it("accepts coords + city", () => {
    const r = MeLocationBody.safeParse({ lat: -30.03, lng: -51.21, city: "Porto Alegre" });
    expect(r.success).toBe(true);
  });

  it("accepts city only (manual, geo denied)", () => {
    const r = MeLocationBody.safeParse({ city: "Porto Alegre" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty city", () => {
    expect(MeLocationBody.safeParse({ city: "" }).success).toBe(false);
  });

  it("rejects a missing city", () => {
    expect(MeLocationBody.safeParse({ lat: -30.03, lng: -51.21 }).success).toBe(false);
  });
});
