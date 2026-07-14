import { z } from "zod/v4";

// No body: confirm-presence always confirms the caller's OWN presence (via
// their own Player, `findOrCreateForUser`) — there's nothing for the client
// to submit besides the match id in the URL. The guest path (submitting a
// name/phone for someone without an account) is Task 9's `public-confirm`.
export const ConfirmPresenceParams = z.object({ id: z.uuid() });
export type ConfirmPresenceParams = z.infer<typeof ConfirmPresenceParams>;
