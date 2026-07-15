import { z } from "zod/v4";

export const ListVoteTallyParams = z.object({ id: z.uuid() });
export type ListVoteTallyParams = z.infer<typeof ListVoteTallyParams>;
