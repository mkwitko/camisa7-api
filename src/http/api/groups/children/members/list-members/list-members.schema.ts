import { z } from "zod/v4";

export const ListMembersParams = z.object({
  id: z.uuid(),
});
export type ListMembersParams = z.infer<typeof ListMembersParams>;
