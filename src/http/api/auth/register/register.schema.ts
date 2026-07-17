import { z } from "zod/v4";
import { RoleSchema } from "../auth.schema";

export const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2).max(120),
  // Marketplace V1: account types the user opts into. Default `["jogador"]`
  // (covers clients that don't send the field); at least one role required.
  roles: z.array(RoleSchema).min(1).default(["jogador"]),
});
export type RegisterBody = z.infer<typeof RegisterBody>;
