import type { FieldPosition } from "@/http/api/groups/children/members/members.types";
import { FIELD_POSITIONS } from "@/http/api/groups/children/members/members.types";

/**
 * Onboarding profile catalogs (FIFA-style rating overhaul) — the fixed
 * vocabulary for the player's self-declared **attributes** (grouped in
 * categories, a redistributable budget) and **skills/playstyles**. Attributes
 * now DRIVE the per-position overall (see `players.rating.ts`) bootstrapped
 * into the career engine and balancer; skills stay descriptive badges.
 *
 * Kept as `const` tuples so they drive both the Zod enums (validation) and the
 * OpenAPI/Kubb types the app consumes — single source of truth.
 */

/** The 6 outfield categories + the goalkeeper category. Order = display order. */
export const ATTRIBUTE_CATEGORIES = [
  "ritmo",
  "finalizacao",
  "passe",
  "drible",
  "defesa",
  "fisico",
  "goleiro",
] as const;
export type AttributeCategory = (typeof ATTRIBUTE_CATEGORIES)[number];

/** Each category's sub-attributes (0-99). Order = display order. */
export const CATEGORY_SUBS: Record<AttributeCategory, readonly string[]> = {
  ritmo: ["aceleracao", "pique"],
  finalizacao: ["posicionamento", "finalizacao", "forca_chute", "chute_longe", "voleio", "penalti"],
  passe: ["visao", "cruzamento", "falta", "passe_curto", "lancamento", "curva"],
  drible: ["agilidade", "equilibrio", "reacao", "controle_bola", "conducao", "compostura"],
  defesa: ["interceptacao", "cabeceio_def", "nocao_def", "dividida", "carrinho"],
  fisico: ["impulsao", "folego", "forca", "combatividade"],
  goleiro: ["elasticidade", "defesa_mao", "reflexo", "saida", "pos_gol", "chute_gol"],
};

/** Flat list of all 35 sub-attribute keys (categories concatenated in order). */
export const ATTRIBUTE_KEYS = ATTRIBUTE_CATEGORIES.flatMap((c) => CATEGORY_SUBS[c]);
export type AttributeKey = string;

/** Which category a sub-attribute belongs to (reverse index of `CATEGORY_SUBS`). */
export const SUB_CATEGORY: Record<string, AttributeCategory> = Object.fromEntries(
  ATTRIBUTE_CATEGORIES.flatMap((c) => CATEGORY_SUBS[c].map((sub) => [sub, c])),
) as Record<string, AttributeCategory>;

/** Each attribute starts here; the player redistributes from a fixed budget. */
export const ATTRIBUTE_BASELINE = 50;
/** Bonus points over the all-50 baseline the player gets to distribute. */
export const ATTRIBUTE_BONUS = 20;
/** Fixed total the attribute map must always sum to: baseline × count + bonus. */
export const ATTRIBUTE_BUDGET = ATTRIBUTE_BASELINE * ATTRIBUTE_KEYS.length + ATTRIBUTE_BONUS;

/**
 * Per-position category weights (0-10). Line positions give weight 0 to
 * `goleiro`; `*_goleiro` positions give it the dominant weight. Consumed by
 * `positionOverall` in `players.rating.ts`.
 */
export const POSITION_WEIGHTS: Record<FieldPosition, Record<AttributeCategory, number>> = {
  futsal_goleiro: { ritmo: 2, finalizacao: 0, passe: 3, drible: 2, defesa: 4, fisico: 4, goleiro: 10 },
  futsal_fixo: { ritmo: 5, finalizacao: 2, passe: 6, drible: 5, defesa: 9, fisico: 7, goleiro: 0 },
  futsal_ala: { ritmo: 9, finalizacao: 7, passe: 7, drible: 9, defesa: 4, fisico: 6, goleiro: 0 },
  futsal_pivo: { ritmo: 6, finalizacao: 9, passe: 6, drible: 8, defesa: 3, fisico: 8, goleiro: 0 },
  society_goleiro: { ritmo: 2, finalizacao: 0, passe: 3, drible: 2, defesa: 4, fisico: 4, goleiro: 10 },
  society_lateral: { ritmo: 8, finalizacao: 3, passe: 6, drible: 6, defesa: 8, fisico: 7, goleiro: 0 },
  society_volante: { ritmo: 6, finalizacao: 4, passe: 7, drible: 6, defesa: 9, fisico: 7, goleiro: 0 },
  society_meia: { ritmo: 6, finalizacao: 7, passe: 10, drible: 9, defesa: 4, fisico: 5, goleiro: 0 },
  society_ala: { ritmo: 9, finalizacao: 7, passe: 7, drible: 9, defesa: 4, fisico: 6, goleiro: 0 },
  society_atacante: { ritmo: 7, finalizacao: 10, passe: 5, drible: 8, defesa: 2, fisico: 7, goleiro: 0 },
  campo_goleiro: { ritmo: 2, finalizacao: 0, passe: 3, drible: 2, defesa: 4, fisico: 4, goleiro: 10 },
  campo_lateral: { ritmo: 8, finalizacao: 3, passe: 6, drible: 6, defesa: 8, fisico: 7, goleiro: 0 },
  campo_ala_volante: { ritmo: 7, finalizacao: 4, passe: 7, drible: 6, defesa: 9, fisico: 8, goleiro: 0 },
  campo_meia_esq: { ritmo: 7, finalizacao: 6, passe: 9, drible: 9, defesa: 4, fisico: 5, goleiro: 0 },
  campo_meia: { ritmo: 6, finalizacao: 6, passe: 10, drible: 8, defesa: 6, fisico: 6, goleiro: 0 },
  campo_meia_dir: { ritmo: 7, finalizacao: 6, passe: 9, drible: 9, defesa: 4, fisico: 5, goleiro: 0 },
  campo_camisa10: { ritmo: 6, finalizacao: 8, passe: 10, drible: 9, defesa: 2, fisico: 4, goleiro: 0 },
  campo_ponta_esq: { ritmo: 9, finalizacao: 7, passe: 7, drible: 10, defesa: 2, fisico: 5, goleiro: 0 },
  campo_atacante: { ritmo: 7, finalizacao: 10, passe: 5, drible: 8, defesa: 2, fisico: 7, goleiro: 0 },
  campo_ponta_dir: { ritmo: 9, finalizacao: 7, passe: 7, drible: 10, defesa: 2, fisico: 5, goleiro: 0 },
};

/** Playstyle catalog (skills) grouped by category. The player picks up to `MAX_SKILLS`. */
export const SKILL_CATALOG = {
  chute_rasteiro: "artilharia", cabeceio_preciso: "artilharia", acrobata: "artilharia",
  chute_colocado: "artilharia", cavadinha: "artilharia", pombo_sem_asas: "artilharia", bola_parada: "artilharia",
  tecnica: "controle_bola", veloz: "controle_bola", dominio: "controle_bola", malvadeza: "controle_bola", cabeca_fria: "controle_bola",
  forca_aerea: "defesa", cercar: "defesa", barreira: "defesa", interceptacao_ps: "defesa", antecipacao: "defesa", carrinho_limpo: "defesa",
  solidez: "fisico", xerife: "fisico", pe_de_vento: "fisico", incansavel: "fisico", lateral_longo: "fisico",
  sai_que_e_sua: "goleiro", arremesso_longo: "goleiro", usa_os_pes: "goleiro", saida_aerea: "goleiro", braco_elastico: "goleiro", deflector: "goleiro",
  passe_direto: "passe", passe_guiado: "passe", passe_longo: "passe", tiki_taka: "passe", passe_de_gps: "passe",
} as const;

export const SKILL_KEYS = Object.keys(SKILL_CATALOG) as (keyof typeof SKILL_CATALOG)[];
export type SkillKey = keyof typeof SKILL_CATALOG;

export const MAX_SKILLS = 5;

/**
 * Fills the 50-baseline defaults for any sub-attribute the player hasn't
 * touched, so responses always carry the full 35-key map even for a player
 * whose stored `attributes` is still `{}` (never onboarded).
 */
export function withAttributeDefaults(stored: Record<string, number>): Record<string, number> {
  const full: Record<string, number> = {};
  for (const key of ATTRIBUTE_KEYS) {
    full[key] = stored[key] ?? ATTRIBUTE_BASELINE;
  }
  return full;
}

export { FIELD_POSITIONS };
