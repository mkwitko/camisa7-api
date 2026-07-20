import { z } from "zod/v4";

export const GenerateTeamsParams = z.object({ id: z.uuid() });
export type GenerateTeamsParams = z.infer<typeof GenerateTeamsParams>;

// Query params always arrive as strings; `z.coerce.number()` converts
// (mirrors `env.ts`'s own `z.coerce.number()` convention) — `.default(2)`
// applies before coercion runs into trouble on an absent value.
export const GenerateTeamsQuery = z.object({
  teamCount: z.coerce.number().int().min(2).default(2),
  mode: z.enum(["balanced", "random"]).default("balanced"),
});
export type GenerateTeamsQuery = z.infer<typeof GenerateTeamsQuery>;
