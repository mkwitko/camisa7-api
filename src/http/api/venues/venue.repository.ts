import type { PrismaLike } from "@/infra/db/client";
import type { Venue } from "./venue.types";

type VenueRow = {
  id: string;
  ownerId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  amenities: string[];
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomainVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    city: row.city,
    amenities: row.amenities,
    phone: row.phone ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type InsertVenueInput = {
  ownerId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  amenities: string[];
  phone?: string | null | undefined;
};

export type UpdateVenuePatch = {
  name?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  address?: string | undefined;
  city?: string | undefined;
  amenities?: string[] | undefined;
  phone?: string | null | undefined;
};

export interface VenueRepository {
  insert(input: InsertVenueInput): Promise<Venue>;
  findById(id: string): Promise<Venue | null>;
  update(id: string, patch: UpdateVenuePatch): Promise<Venue>;
  /** Venues owned by `ownerId` (the dashboard list), newest first. */
  listByOwner(ownerId: string): Promise<Venue[]>;
}

/** Factory `createVenueRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createVenueRepository(db: PrismaLike): VenueRepository {
  return {
    async insert(input) {
      const row = await db.venue.create({
        data: {
          ownerId: input.ownerId,
          name: input.name,
          latitude: input.latitude,
          longitude: input.longitude,
          address: input.address,
          city: input.city,
          amenities: input.amenities,
          phone: input.phone ?? null,
        },
      });
      return toDomainVenue(row);
    },

    async findById(id) {
      const row = await db.venue.findUnique({ where: { id } });
      return row ? toDomainVenue(row) : null;
    },

    async update(id, patch) {
      const row = await db.venue.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.latitude !== undefined ? { latitude: patch.latitude } : {}),
          ...(patch.longitude !== undefined ? { longitude: patch.longitude } : {}),
          ...(patch.address !== undefined ? { address: patch.address } : {}),
          ...(patch.city !== undefined ? { city: patch.city } : {}),
          ...(patch.amenities !== undefined ? { amenities: patch.amenities } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        },
      });
      return toDomainVenue(row);
    },

    async listByOwner(ownerId) {
      const rows = await db.venue.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toDomainVenue);
    },
  };
}
