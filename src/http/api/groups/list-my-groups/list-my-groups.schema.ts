import { z } from "zod/v4";
import { GroupResponse } from "../groups.schema";

export const GroupNextMatchResponse = z.object({
  id: z.uuid(),
  datetime: z.string(),
  location: z.string(),
});
export type GroupNextMatchResponse = z.infer<typeof GroupNextMatchResponse>;

// Extends the shared `GroupResponse` with the summary fields the app needs
// to render a group card without a follow-up request per group.
export const GroupWithMetaResponse = GroupResponse.extend({
  memberCount: z.number().int().min(0),
  nextMatch: GroupNextMatchResponse.nullable(),
});
export type GroupWithMetaResponse = z.infer<typeof GroupWithMetaResponse>;

export const ListMyGroupsResponse = z.array(GroupWithMetaResponse);
export type ListMyGroupsResponse = z.infer<typeof ListMyGroupsResponse>;
