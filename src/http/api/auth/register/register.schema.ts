import { z } from "zod/v4";

export const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2).max(120),
});
export type RegisterBody = z.infer<typeof RegisterBody>;
