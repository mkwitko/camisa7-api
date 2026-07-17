import { describe, expect, it } from "vitest";
import { assertNoOverlap } from "./court.price-rules";
import type { PriceRuleInput } from "./court.schema";

const rule = (overrides: Partial<PriceRuleInput> = {}): PriceRuleInput => ({
  weekday: 1,
  startMinute: 0,
  endMinute: 60,
  priceCents: 1000,
  ...overrides,
});

describe("assertNoOverlap", () => {
  it("accepts an empty list", () => {
    expect(() => assertNoOverlap([])).not.toThrow();
  });

  it("accepts a single rule", () => {
    expect(() => assertNoOverlap([rule()])).not.toThrow();
  });

  it("accepts adjacent windows on the same weekday (end === next start)", () => {
    const rules = [
      rule({ startMinute: 0, endMinute: 60 }),
      rule({ startMinute: 60, endMinute: 120 }),
    ];
    expect(() => assertNoOverlap(rules)).not.toThrow();
  });

  it("accepts overlapping-looking windows on DIFFERENT weekdays", () => {
    const rules = [
      rule({ weekday: 1, startMinute: 0, endMinute: 120 }),
      rule({ weekday: 2, startMinute: 60, endMinute: 180 }),
    ];
    expect(() => assertNoOverlap(rules)).not.toThrow();
  });

  it("accepts rules given out of order (sorts before checking)", () => {
    const rules = [
      rule({ startMinute: 120, endMinute: 180 }),
      rule({ startMinute: 0, endMinute: 60 }),
      rule({ startMinute: 60, endMinute: 120 }),
    ];
    expect(() => assertNoOverlap(rules)).not.toThrow();
  });

  it("rejects two windows that overlap on the same weekday", () => {
    const rules = [
      rule({ startMinute: 0, endMinute: 90 }),
      rule({ startMinute: 60, endMinute: 120 }),
    ];
    expect(() => assertNoOverlap(rules)).toThrow(expect.objectContaining({ code: "CRT-T0003" }));
  });

  it("rejects a window fully nested inside another on the same weekday", () => {
    const rules = [
      rule({ startMinute: 0, endMinute: 120 }),
      rule({ startMinute: 30, endMinute: 60 }),
    ];
    expect(() => assertNoOverlap(rules)).toThrow(expect.objectContaining({ code: "CRT-T0003" }));
  });

  it("rejects duplicate identical windows on the same weekday", () => {
    const rules = [
      rule({ startMinute: 0, endMinute: 60 }),
      rule({ startMinute: 0, endMinute: 60 }),
    ];
    expect(() => assertNoOverlap(rules)).toThrow(expect.objectContaining({ code: "CRT-T0003" }));
  });
});
