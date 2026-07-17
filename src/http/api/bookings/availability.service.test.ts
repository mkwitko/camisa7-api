import { describe, expect, it } from "vitest";
import type { PriceRule } from "@/http/api/courts/court.types";
import { computeAvailability, resolveSlotPrice } from "./availability.service";

// 2026-07-20 is a Monday (`getUTCDay() === 1`).
const MONDAY = "2026-07-20";
const TUESDAY = "2026-07-21";

const court = (slotMinutes = 60) => ({ slotMinutes });

const priceRule = (overrides: Partial<PriceRule> = {}): PriceRule => ({
  id: "rule1",
  courtId: "court1",
  weekday: 1,
  startMinute: 0,
  endMinute: 60,
  priceCents: 1000,
  ...overrides,
});

describe("computeAvailability", () => {
  it("returns an empty array when there's no price rule for the date's weekday", () => {
    const slots = computeAvailability(court(), [], MONDAY, []);
    expect(slots).toEqual([]);
  });

  it("returns an empty array when the only rules are for a DIFFERENT weekday", () => {
    const rules = [priceRule({ weekday: 2 })]; // Tuesday, date below is Monday
    const slots = computeAvailability(court(), rules, MONDAY, []);
    expect(slots).toEqual([]);
  });

  it("expands a rule 1080-1380 with slotMinutes=60 into exactly 5 slots", () => {
    const rules = [priceRule({ weekday: 1, startMinute: 1080, endMinute: 1380, priceCents: 8000 })];

    const slots = computeAvailability(court(60), rules, MONDAY, []);

    expect(slots).toHaveLength(5);
    expect(slots).toEqual([
      { startMinute: 1080, endMinute: 1140, priceCents: 8000, available: true },
      { startMinute: 1140, endMinute: 1200, priceCents: 8000, available: true },
      { startMinute: 1200, endMinute: 1260, priceCents: 8000, available: true },
      { startMinute: 1260, endMinute: 1320, priceCents: 8000, available: true },
      { startMinute: 1320, endMinute: 1380, priceCents: 8000, available: true },
    ]);
  });

  it("marks a slot unavailable when its startMinute is in activeStartMinutes", () => {
    const rules = [priceRule({ weekday: 1, startMinute: 1080, endMinute: 1380, priceCents: 8000 })];

    const slots = computeAvailability(court(60), rules, MONDAY, [1200]);

    expect(slots.find((s) => s.startMinute === 1200)).toMatchObject({ available: false });
    expect(slots.filter((s) => s.available)).toHaveLength(4);
  });

  it("drops a trailing partial slot when the rule's span isn't a multiple of slotMinutes", () => {
    const rules = [priceRule({ weekday: 1, startMinute: 0, endMinute: 100, priceCents: 5000 })];

    const slots = computeAvailability(court(60), rules, MONDAY, []);

    expect(slots).toEqual([{ startMinute: 0, endMinute: 60, priceCents: 5000, available: true }]);
  });

  it("expands multiple rules on the same weekday independently", () => {
    const rules = [
      priceRule({ weekday: 1, startMinute: 0, endMinute: 60, priceCents: 5000 }),
      priceRule({ weekday: 1, startMinute: 1200, endMinute: 1260, priceCents: 9000 }),
    ];

    const slots = computeAvailability(court(60), rules, MONDAY, []);

    expect(slots).toEqual([
      { startMinute: 0, endMinute: 60, priceCents: 5000, available: true },
      { startMinute: 1200, endMinute: 1260, priceCents: 9000, available: true },
    ]);
  });

  it("resolves the weekday for a different date independently (Tuesday rule vs Monday date)", () => {
    const rules = [priceRule({ weekday: 2, startMinute: 0, endMinute: 60, priceCents: 5000 })];

    expect(computeAvailability(court(), rules, MONDAY, [])).toEqual([]);
    expect(computeAvailability(court(), rules, TUESDAY, [])).toEqual([
      { startMinute: 0, endMinute: 60, priceCents: 5000, available: true },
    ]);
  });
});

describe("resolveSlotPrice", () => {
  const rules = [priceRule({ weekday: 1, startMinute: 1080, endMinute: 1380, priceCents: 8000 })];

  it("returns the priceCents for a slot exactly matching the grid", () => {
    expect(resolveSlotPrice(court(60), rules, MONDAY, 1200, 1260)).toBe(8000);
  });

  it("returns null for a slot outside any price rule window", () => {
    expect(resolveSlotPrice(court(60), rules, MONDAY, 0, 60)).toBeNull();
  });

  it("returns null for a slot misaligned to the slotMinutes grid", () => {
    expect(resolveSlotPrice(court(60), rules, MONDAY, 1110, 1170)).toBeNull();
  });

  it("ignores occupancy — resolves price even for a slot that's actually booked", () => {
    expect(resolveSlotPrice(court(60), rules, MONDAY, 1200, 1260)).toBe(8000);
  });
});
