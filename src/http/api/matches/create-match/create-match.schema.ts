import { z } from "zod/v4";
import { ModalitySchema } from "@/http/api/matches/matches.schema";

export const CreateMatchParams = z.object({
  id: z.uuid(),
});
export type CreateMatchParams = z.infer<typeof CreateMatchParams>;

export const CreateMatchBody = z.object({
  datetime: z.string(),
  location: z.string().min(1),
  priceCents: z.number().int().min(0).optional(),
  slots: z.number().int().min(2).max(64),
  pixKey: z.string().optional(),
  // App envia sempre (campo obrigatório no form); default `campo` cobre o DB
  // default e mantém compat com chamadas legadas/materialização de série.
  modality: ModalitySchema.default("campo"),
});
export type CreateMatchBody = z.infer<typeof CreateMatchBody>;
