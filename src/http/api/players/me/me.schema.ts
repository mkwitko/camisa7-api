import { z } from "zod/v4";
import {
  AffinityValueSchema,
  FieldPositionSchema,
} from "@/http/api/groups/children/members/members.schema";
import {
  ATTRIBUTE_BUDGET,
  ATTRIBUTE_CATEGORIES,
  ATTRIBUTE_KEYS,
  MAX_SKILLS,
  SKILL_KEYS,
} from "@/http/api/players/players.catalog";

export const AttributeKeySchema = z.enum(ATTRIBUTE_KEYS as [string, ...string[]]);
export const AttributeValueSchema = z.number().int().min(0).max(99);
export const SkillKeySchema = z.enum(SKILL_KEYS as unknown as [string, ...string[]]);
export const AttributeCategorySchema = z.enum(ATTRIBUTE_CATEGORIES);

/** The attribute budget map (partialRecord on the wire; the PATCH body refines completeness/sum). */
export const AttributesSchema = z.partialRecord(AttributeKeySchema, AttributeValueSchema);

/** Up to `MAX_SKILLS` distinct skill tags from the catalog. */
export const SkillsSchema = z
  .array(SkillKeySchema)
  .max(MAX_SKILLS)
  .refine((skills) => new Set(skills).size === skills.length, {
    message: "skills must be unique",
  });

// ─── Card fields (FIFA-style profile) ──────────────────────────────────────
export const FootSchema = z.enum(["left", "right", "both"]);
export const StarSchema = z.number().int().min(1).max(5);

const CardFields = {
  dominantFoot: FootSchema.nullable(),
  weakFoot: StarSchema.nullable(),
  skillMoves: StarSchema.nullable(),
  heightCm: z.number().int().min(100).max(250).nullable(),
  weightKg: z.number().int().min(30).max(200).nullable(),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  preferredTeam: z.string().max(80).nullable(),
  nationality: z.string().max(80).nullable(),
};

// The caller's own canonical `Player` (F1-7). `affinity` is the FM rating map;
// `attributes`/`skills`/card fields are the descriptive FIFA-style profile.
// `categoryOverall`/`overallByPosition`/`generalOverall` are DERIVED from
// `attributes` (+ affinity) by the presenter — read-only convenience for the
// app/web card.
export const MyPlayerResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  // Public unique slug for the caller to build their OWN shareable card link
  // (`/j/:slug`, futebol-web/app Fase 3) — see `player-slug.ts`.
  slug: z.string(),
  phone: z.string().nullable(),
  userId: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  affinity: z.partialRecord(FieldPositionSchema, AffinityValueSchema),
  attributes: AttributesSchema,
  skills: z.array(SkillKeySchema),
  ...CardFields,
  categoryOverall: z.partialRecord(AttributeCategorySchema, z.number().int().min(0).max(99)),
  overallByPosition: z.partialRecord(FieldPositionSchema, z.number().int().min(0).max(99)),
  generalOverall: z.number().int().min(0).max(99),
});
export type MyPlayerResponse = z.infer<typeof MyPlayerResponse>;

/**
 * `PATCH /players/me` — the player edits their OWN descriptive profile. All
 * fields optional. When `attributes` is present it MUST cover the full catalog
 * and sum to `ATTRIBUTE_BUDGET` (baseline redistributed + 20 bonus).
 */
export const UpdateMyPlayerBody = z.object({
  avatarUrl: z.string().url().nullable().optional(),
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
  dominantFoot: FootSchema.nullable().optional(),
  weakFoot: StarSchema.nullable().optional(),
  skillMoves: StarSchema.nullable().optional(),
  heightCm: z.number().int().min(100).max(250).nullable().optional(),
  weightKg: z.number().int().min(30).max(200).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  preferredTeam: z.string().max(80).nullable().optional(),
  nationality: z.string().max(80).nullable().optional(),
});
export type UpdateMyPlayerBody = z.infer<typeof UpdateMyPlayerBody>;
