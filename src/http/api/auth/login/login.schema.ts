import { z } from "zod/v4";

export const LoginBody = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBody>;
