import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";

/**
 * One nearby candidate straight off the join, BEFORE overall/level are
 * derived — `attributes`/`affinity` are `PlayerCareer`'s raw JSON (`null`
 * when the candidate has no career yet, e.g. never played a finalized
 * match), left for `get-suggestions.service.ts` to run through
 * `generalOverallFrom`/`deriveLevel` alongside the caller's own overall.
 */
export type SuggestionCandidate = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  distanceKm: number;
  attributes: unknown;
  affinity: unknown;
};

export type NearbyCandidatesInput = {
  /** Excluded from the results (a player never suggests themselves). */
  meUserId: string;
  /**
   * The caller's own `Player.id`, when they have one — used to exclude
   * anyone who already shares a `Group` with the caller (a "nearby
   * stranger" finder, not a re-listing of people already in a shared
   * group). `null` for a user with no `Player` row yet (brand-new account,
   * never onboarded) — the group-exclusion clause is simply omitted rather
   * than built around a `null` id, since `playerId = NULL` would never
   * match any row anyway (SQL null-comparison semantics) and building the
   * subquery around it wastes a join for nothing.
   */
  myPlayerId: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  take: number;
};

export interface SuggestionsRepository {
  /**
   * Nearest-first candidates within `radiusKm` of `(lat, lng)`, excluding
   * the caller and anyone who already shares a `Group` with them. Backed by
   * PostgreSQL's earthdistance functions (`earth_distance`/`ll_to_earth`),
   * same pattern as `discover.repository.ts`'s `search` — all dynamic
   * values are parameterized via `Prisma.sql` (no string interpolation of
   * user input).
   */
  nearbyCandidates(input: NearbyCandidatesInput): Promise<SuggestionCandidate[]>;
}

/**
 * Raw row shape returned by the `$queryRaw` below — earthdistance's
 * `earth_distance` returns `double precision` (`number`); `attributes`/
 * `affinity` come back as whatever JSON Postgres holds (`null` when the
 * `LEFT JOIN "PlayerCareer"` finds no row).
 */
type SuggestionRow = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  attributes: unknown;
  affinity: unknown;
  distanceMeters: number;
};

export function createSuggestionsRepository(db: PrismaLike): SuggestionsRepository {
  return {
    async nearbyCandidates(input) {
      // Omitted entirely for a `myPlayerId` of `null` (see the field's doc
      // comment above) rather than parameterizing a `NULL` into the
      // subquery — either way excludes nobody, but this skips the join.
      const excludeSharedGroups = input.myPlayerId
        ? Prisma.sql`
            AND p."id" NOT IN (
              SELECT gm2."playerId" FROM "GroupMember" gm2
              WHERE gm2."groupId" IN (
                SELECT gm1."groupId" FROM "GroupMember" gm1 WHERE gm1."playerId" = ${input.myPlayerId}::uuid
              )
            )
          `
        : Prisma.empty;

      const rows = await db.$queryRaw<SuggestionRow[]>(Prisma.sql`
        SELECT p."id" AS "playerId", p."name" AS "name", p."avatarUrl" AS "avatarUrl",
               u."lastCity" AS "city",
               pc."attributes" AS "attributes", pc."affinity" AS "affinity",
               earth_distance(ll_to_earth(${input.lat}, ${input.lng}), ll_to_earth(u."lastLat", u."lastLng")) AS "distanceMeters"
        FROM "Player" p
        JOIN "User" u ON u."id" = p."userId"
        LEFT JOIN "PlayerCareer" pc ON pc."playerId" = p."id"
        WHERE p."userId" IS NOT NULL
          AND u."id" <> ${input.meUserId}::uuid
          AND u."lastLat" IS NOT NULL AND u."lastLng" IS NOT NULL
          AND earth_distance(ll_to_earth(${input.lat}, ${input.lng}), ll_to_earth(u."lastLat", u."lastLng")) <= ${input.radiusKm} * 1000
          ${excludeSharedGroups}
        ORDER BY "distanceMeters" ASC
        LIMIT ${input.take}
      `);

      return rows.map((row) => ({
        playerId: row.playerId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        city: row.city,
        distanceKm: Math.round((Number(row.distanceMeters) / 1000) * 10) / 10,
        attributes: row.attributes,
        affinity: row.affinity,
      }));
    },
  };
}
