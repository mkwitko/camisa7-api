import { z } from "zod/v4";

// Shared response shapes for register/login/me — see ARCHITECTURE.md §3.5
// ("compartilhados do recurso").
export const UserResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  hasPassword: z.boolean(),
  googleSub: z.string().nullable(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof UserResponse>;

export const AuthResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: UserResponse,
});
export type AuthResponse = z.infer<typeof AuthResponse>;
