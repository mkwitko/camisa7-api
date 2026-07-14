import { z } from "zod/v4";

export const CancelPresenceParams = z.object({ id: z.uuid(), attId: z.uuid() });
export type CancelPresenceParams = z.infer<typeof CancelPresenceParams>;
