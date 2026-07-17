import { z } from "zod/v4";
import { RoleSchema } from "../auth.schema";

export const UpdateMeRolesBody = z.object({
  // Marketplace V1: replaces the caller's account types. At least one role
  // required (a user is always at minimum a `jogador`).
  roles: z.array(RoleSchema).min(1),
});
export type UpdateMeRolesBody = z.infer<typeof UpdateMeRolesBody>;
