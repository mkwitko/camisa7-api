import { Prisma } from "@/generated/prisma/client";
import type { Modality } from "@/http/api/matches/matches.types";
import type { PrismaLike } from "@/infra/db/client";

/**
 * One discoverable public match — a cross-aggregate read shape, not a domain
 * `Match`. Carries the parent group's `groupName`/`joinPolicy`, the count of
 * confirmed attendees (`confirmedCount`), whether the match is `full`
 * (`confirmedCount >= slots`), and the great-circle `distanceKm` from the
 * search origin. Coordinates are always present (the query filters out
 * matches with null coords).
 */
export type DiscoveredMatch = {
  matchId: string;
  groupId: string;
  groupName: string;
  datetime: string;
  location: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  priceCents: number;
  slots: number;
  confirmedCount: number;
  distanceKm: number;
  modality: Modality;
  joinPolicy: "open" | "request";
  full: boolean;
};

export type DiscoverSearchInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  now: Date;
  limit: number;
  modality?: Modality | undefined;
  maxPriceCents?: number | undefined;
};

export interface DiscoverRepository {
  search(input: DiscoverSearchInput): Promise<DiscoveredMatch[]>;
}

/**
 * Raw row shape returned by the `$queryRaw` below — Postgres hands `Int` back
 * as JS `number`, but `COUNT(...)` comes back as `BigInt` and the
 * earthdistance functions return `double precision` (`number`). We normalize
 * (`Number(...)`) in the mapper.
 */
type DiscoverRow = {
  matchId: string;
  groupId: string;
  groupName: string;
  datetime: Date;
  location: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  priceCents: number;
  slots: number;
  confirmedCount: bigint;
  distanceMeters: number;
  modality: Modality;
  joinPolicy: "open" | "request";
};

/**
 * Radius search over PUBLIC groups' upcoming open matches, backed by
 * PostgreSQL's earthdistance functions (`earth_distance`/`ll_to_earth`) —
 * these live outside the Prisma client, so this is a `$queryRaw` (the reason
 * the migration enables the `cube`+`earthdistance` extensions). All dynamic
 * values are parameterized via `Prisma.sql` fragments (no string interpolation
 * of user input). Only matches that are: in a `isPublic` group, `status =
 * 'open'`, `datetime > now`, and have non-null coords within `radiusKm` are
 * returned — ordered nearest-first, capped at `limit`. `confirmedCount` is a
 * correlated subquery over confirmed attendances.
 */
export function createDiscoverRepository(db: PrismaLike): DiscoverRepository {
  return {
    async search(input) {
      const filters: Prisma.Sql[] = [];
      if (input.modality !== undefined) {
        filters.push(Prisma.sql`AND m."modality" = ${input.modality}::"Modality"`);
      }
      if (input.maxPriceCents !== undefined) {
        filters.push(Prisma.sql`AND m."priceCents" <= ${input.maxPriceCents}`);
      }
      const extraFilters = filters.length > 0 ? Prisma.join(filters, " ") : Prisma.empty;

      const rows = await db.$queryRaw<DiscoverRow[]>(Prisma.sql`
        SELECT
          m."id" AS "matchId",
          m."groupId" AS "groupId",
          g."name" AS "groupName",
          m."datetime" AS "datetime",
          m."location" AS "location",
          m."address" AS "address",
          m."city" AS "city",
          m."latitude" AS "latitude",
          m."longitude" AS "longitude",
          m."priceCents" AS "priceCents",
          m."slots" AS "slots",
          m."modality" AS "modality",
          g."joinPolicy" AS "joinPolicy",
          (
            SELECT COUNT(*) FROM "Attendance" a
            WHERE a."matchId" = m."id" AND a."status" = 'confirmed'
          ) AS "confirmedCount",
          earth_distance(
            ll_to_earth(${input.lat}, ${input.lng}),
            ll_to_earth(m."latitude", m."longitude")
          ) AS "distanceMeters"
        FROM "Match" m
        JOIN "Group" g ON g."id" = m."groupId"
        WHERE g."isPublic" = true
          AND m."status" = 'open'
          AND m."datetime" > ${input.now}
          AND m."latitude" IS NOT NULL
          AND m."longitude" IS NOT NULL
          AND earth_distance(
            ll_to_earth(${input.lat}, ${input.lng}),
            ll_to_earth(m."latitude", m."longitude")
          ) <= ${input.radiusKm} * 1000
          ${extraFilters}
        ORDER BY "distanceMeters" ASC
        LIMIT ${input.limit}
      `);

      return rows.map((row) => {
        const confirmedCount = Number(row.confirmedCount);
        return {
          matchId: row.matchId,
          groupId: row.groupId,
          groupName: row.groupName,
          datetime: row.datetime.toISOString(),
          location: row.location,
          address: row.address,
          city: row.city,
          latitude: row.latitude,
          longitude: row.longitude,
          priceCents: row.priceCents,
          slots: row.slots,
          confirmedCount,
          distanceKm: Number(row.distanceMeters) / 1000,
          modality: row.modality,
          joinPolicy: row.joinPolicy,
          full: confirmedCount >= row.slots,
        };
      });
    },
  };
}
