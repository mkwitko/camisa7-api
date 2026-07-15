import { z } from "zod/v4";

export const GetTeamsParams = z.object({ id: z.uuid() });
export type GetTeamsParams = z.infer<typeof GetTeamsParams>;
