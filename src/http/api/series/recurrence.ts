import type { RecurrenceRule } from "./series.types";

function atTimeUTC(base: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m, 0, 0),
  );
}

/** Último dia do mês (UTC) para (year, monthIndex 0-11). */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Próximas `count` datas em UTC estritamente após `from`, aplicando `time`
 * ("HH:mm" UTC). `manual` → []. Determinística; sem `Date.now()`.
 */
export function computeOccurrences(
  rule: RecurrenceRule,
  time: string,
  from: Date,
  count: number,
): Date[] {
  if (rule.kind === "manual") return [];
  const out: Date[] = [];

  if (rule.kind === "weekly") {
    // Âncora do interval = domingo da semana SEGUINTE à de `from` (weekIndex 0).
    // A semana de `from` nunca produz candidato (mesmo dia da semana já passou).
    const cursor = new Date(from);
    cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay()); // volta pro domingo
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() + 7); // avança para a semana seguinte
    let weekIndex = 0;
    while (out.length < count) {
      if (weekIndex % rule.interval === 0) {
        for (const wd of [...rule.weekdays].sort((a, b) => a - b)) {
          const day = new Date(cursor);
          day.setUTCDate(day.getUTCDate() + wd);
          const cand = atTimeUTC(day, time);
          if (cand.getTime() > from.getTime()) out.push(cand);
          if (out.length >= count) break;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      weekIndex++;
    }
    return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
  }

  if (rule.kind === "monthly_dom") {
    let y = from.getUTCFullYear();
    let mo = from.getUTCMonth();
    while (out.length < count) {
      const day = Math.min(rule.day, lastDayOfMonth(y, mo));
      const cand = atTimeUTC(new Date(Date.UTC(y, mo, day)), time);
      if (cand.getTime() > from.getTime()) out.push(cand);
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
      if (cand.getTime() > from.getTime()) out.push(cand);
    }
    mo++;
    if (mo > 11) {
      mo = 0;
      y++;
    }
  }
  return out;
}
