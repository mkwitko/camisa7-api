import { z } from "zod/v4";

// Geo (G1) — última localização do jogador. `lat`/`lng` opcionais: cidade
// manual (geo negada) envia só `city`.
export const MeLocationBody = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  city: z.string().min(1).max(120),
});
export type MeLocationBody = z.infer<typeof MeLocationBody>;
