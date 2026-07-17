/**
 * Marketplace V1: the fixed vocabulary of `Venue` amenities. Kept as a `const`
 * tuple so it drives both the Zod enum (validation) and the OpenAPI/Kubb types
 * the web dashboard consumes — single source of truth. Labels are pt-BR
 * display strings for the venue form's amenity checklist; the web/app may
 * localize their own copy, but the catalog itself ships a default label per
 * key so the API can expose it.
 */
export const AMENITY_KEYS = [
  "gramado",
  "iluminacao",
  "estacionamento",
  "vestiario",
  "bar",
  "lanchonete",
  "cobertura",
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

/** pt-BR display label per amenity key (order = display order). */
export const AMENITY_LABELS: Record<AmenityKey, string> = {
  gramado: "Gramado",
  iluminacao: "Iluminação",
  estacionamento: "Estacionamento",
  vestiario: "Vestiário",
  bar: "Bar",
  lanchonete: "Lanchonete",
  cobertura: "Cobertura",
};

/** The catalog as an array of `{ key, label }` — the shape the API exposes. */
export const AMENITY_CATALOG = AMENITY_KEYS.map((key) => ({
  key,
  label: AMENITY_LABELS[key],
}));
