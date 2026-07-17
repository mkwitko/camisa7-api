import type { BillingMode } from "@/http/api/dues/dues.types";
import type { Player } from "@/http/api/players/players.types";

/**
 * On-field position — mirrors the Prisma `Position` enum values as a plain
 * string union so this module doesn't depend on the generated Prisma
 * client's types (same rationale as `GroupStatsMode` in `groups.types.ts`).
 * `secondaryPos` and the `affinity`/`seedOverall` JSON key sets are all
 * constrained to this same set (validated via Zod at the HTTP boundary) —
 * the balancer (Task 10) consumes it.
 */
export type Position = "goleiro" | "zagueiro" | "lateral" | "volante" | "meia" | "atacante";

export const POSITIONS: readonly Position[] = [
  "goleiro",
  "zagueiro",
  "lateral",
  "volante",
  "meia",
  "atacante",
];

/** Match modality — mirrors the Prisma `Modality` enum. */
export type Modality = "futsal" | "society" | "campo";

export const MODALITIES: readonly Modality[] = ["futsal", "society", "campo"];

/**
 * Modality-scoped on-field position (Task: modalidade). The player's OWN
 * self-declared `affinity` and derived `PlayerCareer.overall` are keyed by
 * these — a SEPARATE vocabulary from `Position` (which still serves the
 * organizer's per-group `primaryPos`/`secondaryPos`/`seedOverall`). Slugs are
 * flat `<modality>_<role>`; keys never cross modalities.
 */
export type FieldPosition =
  | "futsal_goleiro" | "futsal_fixo" | "futsal_ala" | "futsal_pivo"
  | "society_goleiro" | "society_lateral" | "society_volante" | "society_meia" | "society_ala" | "society_atacante"
  | "campo_goleiro" | "campo_lateral" | "campo_ala_volante" | "campo_meia_esq" | "campo_meia" | "campo_meia_dir" | "campo_camisa10" | "campo_ponta_esq" | "campo_atacante" | "campo_ponta_dir";

export const MODALITY_POSITIONS: Record<Modality, readonly FieldPosition[]> = {
  futsal: ["futsal_goleiro", "futsal_fixo", "futsal_ala", "futsal_pivo"],
  society: ["society_goleiro", "society_lateral", "society_volante", "society_meia", "society_ala", "society_atacante"],
  campo: ["campo_goleiro", "campo_lateral", "campo_ala_volante", "campo_meia_esq", "campo_meia", "campo_meia_dir", "campo_camisa10", "campo_ponta_esq", "campo_atacante", "campo_ponta_dir"],
};

export const FIELD_POSITIONS: readonly FieldPosition[] = [
  ...MODALITY_POSITIONS.futsal,
  ...MODALITY_POSITIONS.society,
  ...MODALITY_POSITIONS.campo,
];

/** A field position is a goalkeeper iff its slug ends in `_goleiro`. */
export function isGoalkeeper(position: string): boolean {
  return position.endsWith("_goleiro");
}

/** A member's role inside one specific group (not a global role). */
export type MemberRole = "organizador" | "jogador";

/** Domain `GroupMember` — the child resource of `Group`, flattened with its `Player`. */
export type GroupMember = {
  id: string;
  groupId: string;
  player: Player;
  role: MemberRole;
  /**
   * Task 1 (UX overhaul): nullable — the organizer no longer sets this at
   * add-member time; `null` until an owner rates the member via
   * `PATCH .../members/:memberId` (`updateRating`). Balancer callers
   * (`resolveOverall`) already treat `null`/`undefined` the same via `??`.
   */
  primaryPos: Position | null;
  secondaryPos: Position[];
  affinity: Record<string, number>;
  seedOverall: Record<string, number>;
  /**
   * Task 1 (Mensalista vs Avulso): `mensalista` members owe a recurring
   * `MembershipDue` per competency month; `avulso` (default) pay per-match.
   * `monthlyFeeCentsOverride` takes precedence over `Group.monthlyFeeCents`
   * when set, `null` meaning "use the group's default".
   */
  billingMode: BillingMode;
  monthlyFeeCentsOverride: number | null;
};
