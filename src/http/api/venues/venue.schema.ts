import { z } from "zod/v4";
import { AMENITY_KEYS } from "./venue.catalog";

// Shared response shape for create/get/list/update — see the company skill's
// ARCHITECTURE.md §3.5 ("compartilhados do recurso").

/** Amenity key constrained to the catalog (`venue.catalog.ts`). */
export const AmenitySchema = z.enum(AMENITY_KEYS);
export type AmenitySchema = z.infer<typeof AmenitySchema>;

export const VenueResponse = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  city: z.string(),
  amenities: z.array(AmenitySchema),
  phone: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VenueResponse = z.infer<typeof VenueResponse>;

export const CreateVenueBody = z.object({
  name: z.string().min(1).max(120),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  amenities: z.array(AmenitySchema).default([]),
  phone: z.string().max(40).optional(),
});
export type CreateVenueBody = z.infer<typeof CreateVenueBody>;

// PATCH — every field optional; only provided keys are applied. `phone`
// nullable so the owner can clear it.
export const UpdateVenueBody = z.object({
  name: z.string().min(1).max(120).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(120).optional(),
  amenities: z.array(AmenitySchema).optional(),
  phone: z.string().max(40).nullable().optional(),
});
export type UpdateVenueBody = z.infer<typeof UpdateVenueBody>;

export const VenueParams = z.object({
  id: z.uuid(),
});
export type VenueParams = z.infer<typeof VenueParams>;

export const ListMyVenuesResponse = z.array(VenueResponse);
export type ListMyVenuesResponse = z.infer<typeof ListMyVenuesResponse>;
