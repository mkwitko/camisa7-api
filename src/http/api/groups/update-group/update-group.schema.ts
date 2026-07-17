import { z } from "zod/v4";

export const UpdateGroupParams = z.object({
  id: z.uuid(),
});
export type UpdateGroupParams = z.infer<typeof UpdateGroupParams>;

export const UpdateGroupBody = z.object({
  monthlyFeeCents: z.number().int().min(0).nullable().optional(),
  /**
   * Geo G3: toggle discovery visibility. Setting `true` requires the
   * `public_groups` entitlement (`update-group.service` throws
   * `GRP.PUBLIC_REQUIRES_PLAN` otherwise).
   */
  isPublic: z.boolean().optional(),
  /** Geo G3: how strangers join this group's public matches. */
  joinPolicy: z.enum(["open", "request"]).optional(),
});
export type UpdateGroupBody = z.infer<typeof UpdateGroupBody>;
