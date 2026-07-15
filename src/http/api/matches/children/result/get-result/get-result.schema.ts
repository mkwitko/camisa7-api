import { z } from "zod/v4";

export const GetResultParams = z.object({ id: z.uuid() });
export type GetResultParams = z.infer<typeof GetResultParams>;
