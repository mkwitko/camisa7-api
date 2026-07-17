/**
 * Domain `Venue` — not the Prisma row. A quadra (arena física) owned by a
 * `User` with role `quadra`, managed on the web. `createdAt`/`updatedAt` are
 * ISO 8601 strings (domain types carry `string`, not `Date` — see the company
 * skill's DATES.md). `amenities` is a free `string[]` validated at the HTTP
 * boundary against `venue.catalog.ts`, not a DB constraint.
 */
export type Venue = {
  id: string;
  ownerId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  amenities: string[];
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};
