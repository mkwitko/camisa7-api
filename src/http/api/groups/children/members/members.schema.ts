import { z } from "zod/v4";

// Shared response shape for add/list/update-member — see ARCHITECTURE.md §3.5
// ("compartilhados do recurso") / §3.6 ("recursos filhos do agregado").
export const PositionSchema = z.enum([
  "goleiro",
  "zagueiro",
  "lateral",
  "volante",
  "meia",
  "atacante",
]);

export const MemberRoleSchema = z.enum(["organizador", "jogador"]);

export const PlayerResponse = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
});
export type PlayerResponse = z.infer<typeof PlayerResponse>;

export const GroupMemberResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  role: MemberRoleSchema,
  primaryPos: PositionSchema,
  secondaryPos: z.array(PositionSchema),
  affinity: z.partialRecord(PositionSchema, z.number()),
  seedOverall: z.partialRecord(PositionSchema, z.number()),
  player: PlayerResponse,
});
export type GroupMemberResponse = z.infer<typeof GroupMemberResponse>;
