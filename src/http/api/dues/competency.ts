/** "YYYY-MM" do mês de `now` em UTC. Determinístico, sem Date.now(). */
export function competencyMonth(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
