import { describe, expect, it } from "vitest";
import { computeOccurrences } from "./recurrence";

// Referência: janeiro/2026, Jan/1 = quinta. Numeração 0=Dom..6=Sáb.
const jan = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`);

describe("computeOccurrences", () => {
  it("T1 semanal interval 1, um dia (quarta)", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [3], interval: 1 },
      "20:00",
      new Date("2026-01-01T00:00:00.000Z"),
      3,
      jan(1),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
    ]);
  });

  it("T2 semanal multi-dia (ter+qui) ordena cronologicamente", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [2, 4], interval: 1 },
      "19:30",
      new Date("2026-01-01T00:00:00.000Z"),
      4,
      jan(1),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-06T19:30:00.000Z",
      "2026-01-08T19:30:00.000Z",
      "2026-01-13T19:30:00.000Z",
      "2026-01-15T19:30:00.000Z",
    ]);
  });

  it("T3 quinzenal (interval 2) pula uma semana", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [3], interval: 2 },
      "20:00",
      jan(5),
      2,
      jan(5),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-01-21T20:00:00.000Z",
    ]);
  });

  it("T4 monthly_dom dia 10", () => {
    const r = computeOccurrences(
      { kind: "monthly_dom", day: 10 },
      "20:00",
      new Date("2026-01-01T00:00:00.000Z"),
      2,
      jan(1),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-10T20:00:00.000Z",
      "2026-02-10T20:00:00.000Z",
    ]);
  });

  it("T5 monthly_dom dia 31 clampa em fevereiro", () => {
    const r = computeOccurrences(
      { kind: "monthly_dom", day: 31 },
      "20:00",
      new Date("2026-01-31T23:59:00.000Z"),
      1,
      jan(1),
    );
    expect(r[0]!.toISOString()).toBe("2026-02-28T20:00:00.000Z");
  });

  it("T6 monthly_nth 1ª quarta", () => {
    const r = computeOccurrences(
      { kind: "monthly_nth", week: 1, weekday: 3 },
      "20:00",
      new Date("2026-01-01T00:00:00.000Z"),
      2,
      jan(1),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-07T20:00:00.000Z",
      "2026-02-04T20:00:00.000Z",
    ]);
  });

  it("T7 monthly_nth última sexta", () => {
    const r = computeOccurrences(
      { kind: "monthly_nth", week: -1, weekday: 5 },
      "20:00",
      new Date("2026-01-01T00:00:00.000Z"),
      1,
      jan(1),
    );
    expect(r[0]!.toISOString()).toBe("2026-01-30T20:00:00.000Z");
  });

  it("T8 manual retorna vazio", () => {
    expect(
      computeOccurrences(
        { kind: "manual" },
        "20:00",
        new Date("2026-01-01T00:00:00.000Z"),
        4,
        jan(1),
      ),
    ).toEqual([]);
  });

  it("T9 semanal inclui jogo desta semana após from", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [6], interval: 1 },
      "20:00",
      jan(5),
      2,
      jan(5),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-10T20:00:00.000Z",
      "2026-01-17T20:00:00.000Z",
    ]);
  });

  it("T10 quinzenal inicial ancorada em startDate", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [6], interval: 2 },
      "20:00",
      jan(5),
      2,
      jan(5),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-10T20:00:00.000Z",
      "2026-01-24T20:00:00.000Z",
    ]);
  });

  it("T11 quinzenal reposição não desloca cadência", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [6], interval: 2 },
      "20:00",
      new Date("2026-01-10T20:00:00.000Z"),
      1,
      jan(5),
    );
    expect(r[0]!.toISOString()).toBe("2026-01-24T20:00:00.000Z");
  });

  it("T12 semanal parcial na semana de from", () => {
    const r = computeOccurrences(
      { kind: "weekly", weekdays: [3, 6], interval: 1 },
      "20:00",
      jan(8),
      3,
      jan(5),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-01-10T20:00:00.000Z",
      "2026-01-14T20:00:00.000Z",
      "2026-01-17T20:00:00.000Z",
    ]);
  });

  it("T13 monthly_dom respeita startDate futuro (exclui ocorrência antes de startDate)", () => {
    const r = computeOccurrences(
      { kind: "monthly_dom", day: 10 },
      "20:00",
      new Date("2026-07-16T00:00:00.000Z"),
      2,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-09-10T20:00:00.000Z",
      "2026-10-10T20:00:00.000Z",
    ]);
  });

  it("T14 monthly_nth respeita startDate futuro (exclui ocorrência antes de startDate)", () => {
    const r = computeOccurrences(
      { kind: "monthly_nth", week: 2, weekday: 2 },
      "20:00",
      new Date("2026-07-16T00:00:00.000Z"),
      2,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(r.map((d) => d.toISOString())).toEqual([
      "2026-09-08T20:00:00.000Z",
      "2026-10-13T20:00:00.000Z",
    ]);
  });
});
