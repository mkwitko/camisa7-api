import { z } from "zod/v4";

export const UpdateTeamsParams = z.object({ id: z.uuid() });
export type UpdateTeamsParams = z.infer<typeof UpdateTeamsParams>;

// The owner submits just the roster split (team index + playerIds) — names
// are resolved server-side from the match's own confirmed attendees, so a
// caller can't smuggle in an arbitrary display name for someone else's
// player.
export const UpdateTeamsBody = z.object({
  teams: z
    .array(
      z.object({
        team: z.number().int().min(0),
        playerIds: z.array(z.uuid()),
      }),
    )
    .min(1),
});
export type UpdateTeamsBody = z.infer<typeof UpdateTeamsBody>;
