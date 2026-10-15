import { z } from "zod/v4";

// Shared response/body shapes for create/update/list/price-rules — see the
// backend conventions ARCHITECTURE.md §3.5 ("compartilhados do recurso").

/** Domain `Modality` — mirrors the Prisma `Modality` enum (same as `matches`). */
export const ModalitySchema = z.enum(["futsal", "society", "campo"]);
export type ModalitySchema = z.infer<typeof ModalitySchema>;

/** Domain `BookingMode` — mirrors the Prisma `BookingMode` enum. */
export const BookingModeSchema = z.enum(["instant", "request", "deposit"]);
export type BookingModeSchema = z.infer<typeof BookingModeSchema>;

/**
 * One weekday+time-window price band. `startMinute`/`endMinute` are minutes
 * since 00:00 (0..1440, so `endMinute:1440` means "until midnight" is
 * expressible); the half-open interval `[startMinute, endMinute)` must be
 * non-empty (`endMinute > startMinute`). Cross-rule overlap (within the same
 * `weekday`) is NOT checked here — that's `assertNoOverlap` in
 * `court.price-rules.ts`, applied to the whole `rules` array at once.
 */
export const PriceRuleInput = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
    priceCents: z.number().int().min(0),
  })
  .refine((rule) => rule.endMinute > rule.startMinute, {
    message: "endMinute deve ser maior que startMinute",
    path: ["endMinute"],
  });
export type PriceRuleInput = z.infer<typeof PriceRuleInput>;

export const PriceRuleResponse = z.object({
  weekday: z.number().int(),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  priceCents: z.number().int(),
});
export type PriceRuleResponse = z.infer<typeof PriceRuleResponse>;

export const CourtResponse = z.object({
  id: z.uuid(),
  venueId: z.uuid(),
  name: z.string(),
  modality: ModalitySchema,
  surface: z.string().nullable(),
  slotMinutes: z.number().int(),
  bookingMode: BookingModeSchema,
  depositPercent: z.number().int().nullable(),
  active: z.boolean(),
  priceRules: z.array(PriceRuleResponse),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourtResponse = z.infer<typeof CourtResponse>;

// `depositPercent` is required (1..100) exactly when `bookingMode ===
// "deposit"` — enforced by `.refine` here since `CreateCourtBody` always
// carries a resolved `bookingMode` (default "instant"). `UpdateCourtBody`
// can't run the same refine (a PATCH may omit `bookingMode` entirely, in
// which case the check needs the court's *existing* mode — that's
// `update-court.service.ts`, not the schema).
export const CreateCourtBody = z
  .object({
    name: z.string().min(1).max(120),
    modality: ModalitySchema,
    surface: z.string().max(60).optional(),
    slotMinutes: z.number().int().min(1).max(1440).default(60),
    bookingMode: BookingModeSchema.default("instant"),
    depositPercent: z.number().int().min(1).max(100).optional(),
  })
  .refine((body) => body.bookingMode !== "deposit" || body.depositPercent !== undefined, {
    message: "depositPercent (1..100) é obrigatório quando bookingMode = deposit",
    path: ["depositPercent"],
  });
export type CreateCourtBody = z.infer<typeof CreateCourtBody>;

// PATCH — every field optional; only provided keys are applied. `surface`/
// `depositPercent` nullable so the owner can clear them (mirrors
// `UpdateVenueBody.phone`).
export const UpdateCourtBody = z.object({
  name: z.string().min(1).max(120).optional(),
  modality: ModalitySchema.optional(),
  surface: z.string().max(60).nullable().optional(),
  slotMinutes: z.number().int().min(1).max(1440).optional(),
  bookingMode: BookingModeSchema.optional(),
  depositPercent: z.number().int().min(1).max(100).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateCourtBody = z.infer<typeof UpdateCourtBody>;

export const SetPriceRulesBody = z.object({
  rules: z.array(PriceRuleInput),
});
export type SetPriceRulesBody = z.infer<typeof SetPriceRulesBody>;

/** `POST /venues/:venueId/courts` and `GET /venues/:venueId/courts` params. */
export const VenueCourtsParams = z.object({
  venueId: z.uuid(),
});
export type VenueCourtsParams = z.infer<typeof VenueCourtsParams>;

/** `PATCH /courts/:id` and `PUT /courts/:id/price-rules` params. */
export const CourtParams = z.object({
  id: z.uuid(),
});
export type CourtParams = z.infer<typeof CourtParams>;

export const ListCourtsResponse = z.array(CourtResponse);
export type ListCourtsResponse = z.infer<typeof ListCourtsResponse>;
