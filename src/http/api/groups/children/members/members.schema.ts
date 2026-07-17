import { z } from "zod/v4";
import { BillingModeSchema } from "@/http/api/dues/dues.schema";
import { FIELD_POSITIONS } from "./members.types";

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

/**
 * Modality-scoped positions (Task: modalidade) — the vocabulary for the
 * player's self-declared `affinity` and `PlayerCareer.overall`. Distinct from
 * `PositionSchema`, which still validates the organizer's per-group rating
 * (`primaryPos`/`secondaryPos`/`seedOverall`).
 */
export const FieldPositionSchema = z.enum(FIELD_POSITIONS as unknown as [string, ...string[]]);

// Bounded numeric schemas for member ratings
export const AffinityValueSchema = z.number().int().min(0).max(100);
export const SeedOverallValueSchema = z.number().int().min(0).max(99);

export const MemberRoleSchema = z.enum(["organizador", "jogador"]);

export const PlayerResponse = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
  // Task 1 (UX overhaul, FM rating model): the player's OWN self-declared
  // affinity map (`{position: 0-100}`) — never set by an organizer.
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema),
});
export type PlayerResponse = z.infer<typeof PlayerResponse>;

export const GroupMemberResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  role: MemberRoleSchema,
  primaryPos: PositionSchema.nullable(),
  secondaryPos: z.array(PositionSchema),
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema),
  seedOverall: z.partialRecord(PositionSchema, SeedOverallValueSchema),
  billingMode: BillingModeSchema,
  monthlyFeeCentsOverride: z.number().int().nullable(),
  player: PlayerResponse,
});
export type GroupMemberResponse = z.infer<typeof GroupMemberResponse>;
