import { describe, expect, it } from "vitest";
import { computeOccurrences } from "./recurrence";

const from = new Date("2026-01-01T00:00:00.000Z"); // quinta

describe("computeOccurrences", () => {
  it("weekly interval 1, um dia (quarta)", () => {
    const r = computeOccurrences({ kind: "weekly", weekdays: [3], interval: 1 }, "20:00", from, 3);
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
    ]);
  });

  it("weekly multi-dia (ter+qui) ordena cronologicamente", () => {
    const r = computeOccurrences({ kind: "weekly", weekdays: [2, 4], interval: 1 }, "19:30", from, 4);
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-06T19:30:00.000Z", // ter
      "2026-01-08T19:30:00.000Z", // qui
      "2026-01-13T19:30:00.000Z",
      "2026-01-15T19:30:00.000Z",
    ]);
  });

  it("quinzenal (interval 2) pula uma semana", () => {
    const r = computeOccurrences({ kind: "weekly", weekdays: [3], interval: 2 }, "20:00", from, 2);
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
    ]);
  });

  it("monthly_dom dia 10", () => {
    const r = computeOccurrences({ kind: "monthly_dom", day: 10 }, "20:00", from, 2);
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-10T20:00:00.000Z",
      "2026-02-10T20:00:00.000Z",
    ]);
  });

  it("monthly_dom dia 31 clampa em fevereiro", () => {
    const feb = new Date("2026-01-31T23:59:00.000Z");
    const r = computeOccurrences({ kind: "monthly_dom", day: 31 }, "20:00", feb, 1);
    expect(r[0]!.toISOString()).toBe("2026-02-28T20:00:00.000Z");
  });

  it("monthly_nth 1ª quarta", () => {
    const r = computeOccurrences({ kind: "monthly_nth", week: 1, weekday: 3 }, "20:00", from, 2);
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-02-04T20:00:00.000Z",
    ]);
  });

  it("monthly_nth última sexta", () => {
    const r = computeOccurrences({ kind: "monthly_nth", week: -1, weekday: 5 }, "20:00", from, 1);
    expect(r[0]!.toISOString()).toBe("2026-01-30T20:00:00.000Z");
  });

  it("manual retorna vazio", () => {
    expect(computeOccurrences({ kind: "manual" }, "20:00", from, 4)).toEqual([]);
  });
});
