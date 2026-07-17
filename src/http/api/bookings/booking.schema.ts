import { z } from "zod/v4";
import { BookingModeSchema } from "@/http/api/courts/court.schema";

/** Domain `BookingStatus` — mirrors the Prisma `BookingStatus` enum. */
export const BookingStatusSchema = z.enum([
  "requested",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
  "expired",
]);
export type BookingStatusSchema = z.infer<typeof BookingStatusSchema>;

export const BookingResponse = z.object({
  id: z.uuid(),
  courtId: z.uuid(),
  bookedById: z.uuid(),
  date: z.string(),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  priceCents: z.number().int(),
  mode: BookingModeSchema,
  status: BookingStatusSchema,
  depositCents: z.number().int().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookingResponse = z.infer<typeof BookingResponse>;

/** `POST /bookings` body. `date` is `YYYY-MM-DD` (`z.iso.date()` — no time-of-day, matches `Booking.date @db.Date`). */
export const CreateBookingBody = z
  .object({
    courtId: z.uuid(),
    date: z.iso.date(),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((body) => body.endMinute > body.startMinute, {
    message: "endMinute deve ser maior que startMinute",
    path: ["endMinute"],
  });
export type CreateBookingBody = z.infer<typeof CreateBookingBody>;

export const PaymentInfoResponse = z.object({
  paymentIntentId: z.string(),
  clientSecret: z.string(),
});
export type PaymentInfoResponse = z.infer<typeof PaymentInfoResponse>;

/**
 * `POST /bookings` response. `payment` is present exactly when `booking.mode
 * !== "request"` (`instant`/`deposit` collect payment immediately;
 * `request` waits for the owner to approve first — see
 * `create-booking.service.ts`).
 */
export const CreateBookingResponse = z.object({
  booking: BookingResponse,
  payment: PaymentInfoResponse.optional(),
});
export type CreateBookingResponse = z.infer<typeof CreateBookingResponse>;

/** `GET /courts/:id/availability` querystring. */
export const AvailabilityQuery = z.object({
  date: z.iso.date(),
});
export type AvailabilityQuery = z.infer<typeof AvailabilityQuery>;

export const AvailabilitySlotResponse = z.object({
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  priceCents: z.number().int(),
  available: z.boolean(),
});
export type AvailabilitySlotResponse = z.infer<typeof AvailabilitySlotResponse>;

export const AvailabilityResponse = z.array(AvailabilitySlotResponse);
export type AvailabilityResponse = z.infer<typeof AvailabilityResponse>;
