export type SeriesStatus = "active" | "paused" | "ended";

/** Regra de recorrência. Discriminante = `kind`. weekday/weekdays: 0=Dom..6=Sáb. */
export type RecurrenceRule =
  | { kind: "weekly"; weekdays: number[]; interval: number } // interval=1 semanal, 2 quinzenal, N a cada-N-semanas
  | { kind: "monthly_dom"; day: number } // dia-do-mês 1-31 (clampa fim de mês)
  | { kind: "monthly_nth"; week: 1 | 2 | 3 | 4 | -1; weekday: number } // "Nª/última <weekday>"
  | { kind: "manual" };

/** Domain MatchSeries — não é a row Prisma. `time` "HH:mm" UTC (null p/ manual). */
export type MatchSeries = {
  id: string;
  groupId: string;
  rule: RecurrenceRule;
  time: string | null;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: SeriesStatus;
  startDate: string; // ISO
  endDate: string | null;
  createdAt: string;
};
