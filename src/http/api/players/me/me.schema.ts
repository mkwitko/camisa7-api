import { z } from "zod/v4";
import {
  AffinityValueSchema,
  FieldPositionSchema,
} from "@/http/api/groups/children/members/members.schema";
import {
  ATTRIBUTE_BUDGET,
  ATTRIBUTE_KEYS,
  MAX_SKILLS,
  SKILL_KEYS,
} from "@/http/api/players/players.catalog";

export const AttributeKeySchema = z.enum(ATTRIBUTE_KEYS);
export const AttributeValueSchema = z.number().int().min(0).max(100);
export const SkillKeySchema = z.enum(SKILL_KEYS);

/**
 * The attribute budget map. `partialRecord` on the wire (responses always
 * carry the full catalog, filled by the presenter; a `PATCH` body is refined
 * separately to require the whole catalog summing to the fixed budget).
 */
export const AttributesSchema = z.partialRecord(AttributeKeySchema, AttributeValueSchema);

/** Up to `MAX_SKILLS` distinct skill tags from the catalog. */
export const SkillsSchema = z
  .array(SkillKeySchema)
  .max(MAX_SKILLS)
  .refine((skills) => new Set(skills).size === skills.length, {
    message: "skills must be unique",
  });

// The caller's own canonical `Player` (F1-7) — an owner may see everything
// about their own player. `affinity` is the FM rating map; `attributes`/
// `skills` are the descriptive onboarding profile (never set by an organizer,
// never fed to the balancer).
export const MyPlayerResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  userId: z.string().nullable(),
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema),
  attributes: AttributesSchema,
  skills: z.array(SkillKeySchema),
});
export type MyPlayerResponse = z.infer<typeof MyPlayerResponse>;

/**
 * `PATCH /players/me` — the player edits their OWN descriptive profile. All
 * three fields are optional (onboarding sends all; the profile screen may send
 * a subset). When `attributes` is present it MUST be the complete catalog
 * summing to `ATTRIBUTE_BUDGET` — the budget is redistributed, never inflated.
 */
export const UpdateMyPlayerBody = z.object({
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema).optional(),
  attributes: z
    .record(AttributeKeySchema, AttributeValueSchema)
    .refine((attrs) => ATTRIBUTE_KEYS.every((k) => attrs[k] !== undefined), {
      message: "attributes must cover the full catalog",
    })
    .refine(
      (attrs) => ATTRIBUTE_KEYS.reduce((sum, k) => sum + (attrs[k] ?? 0), 0) === ATTRIBUTE_BUDGET,
      { message: `attributes must sum to ${ATTRIBUTE_BUDGET}` },
    )
    .optional(),
  skills: SkillsSchema.optional(),
});
export type UpdateMyPlayerBody = z.infer<typeof UpdateMyPlayerBody>;
