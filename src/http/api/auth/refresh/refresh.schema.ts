import { z } from "zod/v4";

export const RefreshBody = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshBody = z.infer<typeof RefreshBody>;
