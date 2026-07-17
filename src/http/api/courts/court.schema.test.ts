import { describe, expect, it } from "vitest";
import { CreateCourtBody, PriceRuleInput } from "./court.schema";

const baseCourt = { name: "Quadra 1", modality: "futsal" as const };

describe("CreateCourtBody defaults", () => {
  it("defaults slotMinutes to 60 and bookingMode to instant", () => {
    const r = CreateCourtBody.safeParse(baseCourt);
    expect(r.success).toBe(true);
    expect(r.success && r.data.slotMinutes).toBe(60);
    expect(r.success && r.data.bookingMode).toBe("instant");
  });
});

describe("CreateCourtBody deposit refine", () => {
  it("accepts bookingMode=instant without depositPercent", () => {
    expect(CreateCourtBody.safeParse({ ...baseCourt, bookingMode: "instant" }).success).toBe(true);
  });

  it("accepts bookingMode=deposit WITH a depositPercent (1..100)", () => {
    const r = CreateCourtBody.safeParse({
      ...baseCourt,
      bookingMode: "deposit",
      depositPercent: 30,
    });
    expect(r.success).toBe(true);
  });

  it("rejects bookingMode=deposit WITHOUT depositPercent", () => {
    const r = CreateCourtBody.safeParse({ ...baseCourt, bookingMode: "deposit" });
    expect(r.success).toBe(false);
  });

  it("rejects a depositPercent outside 1..100 even in deposit mode", () => {
    expect(
      CreateCourtBody.safeParse({ ...baseCourt, bookingMode: "deposit", depositPercent: 0 })
        .success,
    ).toBe(false);
    expect(
      CreateCourtBody.safeParse({ ...baseCourt, bookingMode: "deposit", depositPercent: 101 })
        .success,
    ).toBe(false);
  });
});

describe("PriceRuleInput endMinute > startMinute refine", () => {
  const base = { weekday: 1, priceCents: 1000 };

  it("accepts a well-formed window", () => {
    expect(PriceRuleInput.safeParse({ ...base, startMinute: 0, endMinute: 60 }).success).toBe(true);
  });

  it("rejects endMinute === startMinute (empty window)", () => {
    expect(PriceRuleInput.safeParse({ ...base, startMinute: 60, endMinute: 60 }).success).toBe(
      false,
    );
  });

  it("rejects endMinute < startMinute", () => {
    expect(PriceRuleInput.safeParse({ ...base, startMinute: 60, endMinute: 0 }).success).toBe(
      false,
    );
  });
});
