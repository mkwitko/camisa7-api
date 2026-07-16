import { z } from "zod/v4";
import { BillingModeSchema } from "@/http/api/dues/dues.schema";

export const AddMemberParams = z.object({
  id: z.uuid(),
});
export type AddMemberParams = z.infer<typeof AddMemberParams>;

// Task 1 (UX overhaul, FM rating model): minimal on purpose — the organizer
// no longer sets the new member's rating (`primaryPos`/`secondaryPos`/
// `affinity`/`seedOverall`, all removed from this body) at add-member time;
// `GroupMember` ratings are still set later via `PATCH .../members/:memberId`
// (owner), while the player's OWN self-declared `Player.affinity` map is
// filled in by the player themselves (not part of this task's scope).
export const AddMemberBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
  billingMode: BillingModeSchema.optional(),
});
export type AddMemberBody = z.infer<typeof AddMemberBody>;
