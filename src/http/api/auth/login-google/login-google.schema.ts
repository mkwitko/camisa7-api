import { z } from "zod/v4";

export const LoginGoogleBody = z.object({
  idToken: z.string().min(1),
});
export type LoginGoogleBody = z.infer<typeof LoginGoogleBody>;
