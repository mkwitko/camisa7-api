const LEGACY_MAP: Record<string, string> = {
  goleiro: "campo_goleiro",
  zagueiro: "campo_lateral",
  lateral: "campo_lateral",
  volante: "campo_ala_volante",
  meia: "campo_meia",
  atacante: "campo_atacante",
};

/**
 * Remaps a legacy 6-position affinity/overall map to the modality-scoped
 * `campo_*` vocabulary (Task: modalidade). `lateral` and `zagueiro` both
 * collapse onto `campo_lateral` — the higher value wins. Already-migrated
 * slugs (or any key not in the legacy set) pass through unchanged.
 */
export function remapLegacyPositions(old: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(old)) {
    const target = LEGACY_MAP[key] ?? key;
    out[target] = out[target] === undefined ? value : Math.max(out[target], value);
  }
  return out;
}
