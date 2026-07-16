import { describe, expect, it } from "vitest";
import { competencyMonth } from "./competency";

describe("competencyMonth", () => {
  it("formats YYYY-MM in UTC", () => {
    expect(competencyMonth(new Date("2026-07-16T12:00:00.000Z"))).toBe("2026-07");
  });
  it("zero-pads single-digit month", () => {
    expect(competencyMonth(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03");
  });
  it("uses UTC month at day boundary (no local drift)", () => {
    // 2026-07-31T23:30 UTC is still July in UTC
    expect(competencyMonth(new Date("2026-07-31T23:30:00.000Z"))).toBe("2026-07");
  });
  it("handles December", () => {
    expect(competencyMonth(new Date("2026-12-15T00:00:00.000Z"))).toBe("2026-12");
  });
});
