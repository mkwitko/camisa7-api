import { z } from "zod/v4";
import { GroupResponse } from "../groups.schema";

export const ListMyGroupsResponse = z.array(GroupResponse);
export type ListMyGroupsResponse = z.infer<typeof ListMyGroupsResponse>;
