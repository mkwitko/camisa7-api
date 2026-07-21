import { z } from "zod/v4";

export const UpdateMatchParams = z.object({
  id: z.uuid(),
});
export type UpdateMatchParams = z.infer<typeof UpdateMatchParams>;

export const UpdateMatchBody = z.object({
  datetime: z.string().optional(),
  location: z.string().min(1).optional(),
  priceCents: z.number().int().min(0).optional(),
  slots: z.number().int().min(2).max(64).optional(),
  pixKey: z.string().nullable().optional(),
  modality: z.enum(["futsal", "society", "campo"]).optional(),
  // Geo editável (mesmo local do LocationPicker na criação). `latitude`/
  // `longitude` NÃO são nullable: dá pra atualizar as coords, nunca zerá-las —
  // uma partida sem coords sumiria do Descobrir (ver create-match COORDS_REQUIRED).
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});
export type UpdateMatchBody = z.infer<typeof UpdateMatchBody>;
