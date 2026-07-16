import type { RecurrenceRule } from "./series.types";

function atTimeUTC(base: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m, 0, 0),
  );
}

/** Meia-noite UTC (00:00:00.000) do dia de `d`. */
function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Domingo (00:00 UTC) da semana UTC que contém `d`. */
function sundayOfUTC(d: Date): Date {
  const day = dateOnlyUTC(d);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day;
}

/** Último dia do mês (UTC) para (year, monthIndex 0-11). */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Próximas `count` ocorrências em UTC, aplicando `time` ("HH:mm" UTC).
 * `manual` → []. Determinística; sem `Date.now()`.
 *
 * `weekly` ancora a fase do `interval` em `startDate` (não em `from`), e
 * compara elegibilidade por DATA (dia UTC): exclui ocorrências cuja data é
 * ≤ à data de `from` ou < à data de `startDate`.
 */
export function computeOccurrences(
  rule: RecurrenceRule,
  time: string,
  from: Date,
  count: number,
  startDate: Date,
): Date[] {
  if (rule.kind === "manual") return [];
  const out: Date[] = [];
  const startDay = dateOnlyUTC(startDate).getTime();

  if (rule.kind === "weekly") {
    const fromDay = dateOnlyUTC(from).getTime();
    const anchor = sundayOfUTC(startDate); // domingo da semana de startDate → weekIndex 0
    const weekdays = [...rule.weekdays].sort((a, b) => a - b);

    // Fast-forward: pula direto para perto de `from` preservando a paridade
    // weekIndex % interval, sem iterar semana a semana desde startDate.
    const weeksToFrom = Math.floor((sundayOfUTC(from).getTime() - anchor.getTime()) / WEEK_MS);
    let weekIndex = Math.max(0, weeksToFrom - 1);
    const cursor = new Date(anchor.getTime() + weekIndex * WEEK_MS);

    while (out.length < count) {
      if (weekIndex % rule.interval === 0) {
        for (const wd of weekdays) {
          const day = new Date(cursor);
          day.setUTCDate(day.getUTCDate() + wd);
          const candDay = day.getTime(); // já é meia-noite UTC
          if (candDay > fromDay && candDay >= startDay) {
            out.push(atTimeUTC(day, time));
            if (out.length >= count) break;
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      weekIndex++;
    }
    return out;
  }

  if (rule.kind === "monthly_dom") {
    let y = from.getUTCFullYear();
    let mo = from.getUTCMonth();
    while (out.length < count) {
      const day = Math.min(rule.day, lastDayOfMonth(y, mo));
      const cand = atTimeUTC(new Date(Date.UTC(y, mo, day)), time);
      if (cand.getTime() > from.getTime() && dateOnlyUTC(cand).getTime() >= startDay)
        out.push(cand);
      mo++;
      if (mo > 11) {
        mo = 0;
        y++;
      }
    }
    return out;
  }

  // monthly_nth
  let y = from.getUTCFullYear();
  let mo = from.getUTCMonth();
  while (out.length < count) {
    let target: Date | null = null;
    if (rule.week === -1) {
      const last = lastDayOfMonth(y, mo);
      for (let d = last; d >= 1; d--) {
        const dt = new Date(Date.UTC(y, mo, d));
        if (dt.getUTCDay() === rule.weekday) {
          target = dt;
          break;
        }
      }
    } else {
      let found = 0;
      for (let d = 1; d <= lastDayOfMonth(y, mo); d++) {
        const dt = new Date(Date.UTC(y, mo, d));
        if (dt.getUTCDay() === rule.weekday) {
          found++;
          if (found === rule.week) {
            target = dt;
            break;
          }
        }
      }
    }
    if (target) {
      const cand = atTimeUTC(target, time);
      if (cand.getTime() > from.getTime() && dateOnlyUTC(cand).getTime() >= startDay)
        out.push(cand);
    }
    mo++;
    if (mo > 11) {
      mo = 0;
      y++;
    }
  }
  return out;
}
