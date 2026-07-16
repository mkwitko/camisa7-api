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
});
export type UpdateMatchBody = z.infer<typeof UpdateMatchBody>;
