import { ERRORS } from "@/shared/errors/catalog";
import type { PriceRuleInput } from "./court.schema";

/**
 * Validates that a `PUT /courts/:id/price-rules` batch has no two rules
 * whose `[startMinute, endMinute)` windows overlap on the same `weekday` —
 * an overlap would make a booked slot's price ambiguous. Groups by
 * `weekday`, sorts each group by `startMinute`, then walks adjacent pairs:
 * sorted + non-overlapping means `rules[i].startMinute >=
 * rules[i-1].endMinute` for every `i`; equal is fine (adjacent windows, e.g.
 * `[0,60)` then `[60,120)`). Throws `ERRORS.CRT.INVALID_PRICE_RULES()` (422)
 * on the first violation found; a no-op for an empty/single-rule list.
 */
export function assertNoOverlap(rules: readonly PriceRuleInput[]): void {
  const byWeekday = new Map<number, PriceRuleInput[]>();
  for (const rule of rules) {
    const group = byWeekday.get(rule.weekday);
    if (group) group.push(rule);
    else byWeekday.set(rule.weekday, [rule]);
  }

  for (const group of byWeekday.values()) {
    const sorted = [...group].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (!previous || !current) continue;
      if (current.startMinute < previous.endMinute) throw ERRORS.CRT.INVALID_PRICE_RULES();
    }
  }
}
