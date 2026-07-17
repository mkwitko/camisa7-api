import { z } from "zod/v4";

// Shared response shapes for register/login/me — see ARCHITECTURE.md §3.5
// ("compartilhados do recurso").

/** Marketplace V1: account types (multi) — mirrors the Prisma `Role` enum. */
export const RoleSchema = z.enum(["jogador", "organizador", "quadra"]);
export type RoleSchema = z.infer<typeof RoleSchema>;

export const UserResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(RoleSchema),
  hasPassword: z.boolean(),
  googleSub: z.string().nullable(),
  lastCity: z.string().nullable(),
  lastLat: z.number().nullable(),
  lastLng: z.number().nullable(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof UserResponse>;

export const AuthResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: UserResponse,
});
export type AuthResponse = z.infer<typeof AuthResponse>;
