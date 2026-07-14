import { z } from "zod/v4";

export const CreateInviteParams = z.object({ id: z.uuid() });
export type CreateInviteParams = z.infer<typeof CreateInviteParams>;

export const CreateInviteResponse = z.object({
  token: z.string(),
  // Convenience for the client — the exact path a guest should be sent
  // (WhatsApp share link). Not persisted, derived from `token`.
  sharePath: z.string(),
});
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;
