import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import { generateSlug, randomHex4 } from "./player-slug";
import { type SkillKey, withAttributeDefaults } from "./players.catalog";
import type { Foot, Player } from "./players.types";

/** Max attempts to generate+insert a fresh slug on a P2002 collision (see `retryOnSlugCollision`). */
const MAX_SLUG_ATTEMPTS = 5;

type PlayerRow = {
  id: string;
  userId: string | null;
  name: string;
  slug: string;
  phone: string | null;
  avatarUrl: string | null;
  affinity: unknown;
  attributes: unknown;
  skills: string[];
  dominantFoot: string | null;
  weakFoot: number | null;
  skillMoves: number | null;
  heightCm: number | null;
  weightKg: number | null;
  birthYear: number | null;
  preferredTeam: string | null;
  nationality: string | null;
};

function toDomainPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    affinity: (row.affinity ?? {}) as Record<string, number>,
    // Always the full catalog — a never-onboarded player stores `{}`, so fill
    // the 50 baseline here.
    attributes: withAttributeDefaults((row.attributes ?? {}) as Record<string, number>),
    // Trusted: only ever written through the validated `PATCH /players/me` body.
    skills: (row.skills ?? []) as SkillKey[],
    dominantFoot: (row.dominantFoot ?? null) as Foot | null,
    weakFoot: row.weakFoot,
    skillMoves: row.skillMoves,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    birthYear: row.birthYear,
    preferredTeam: row.preferredTeam,
    nationality: row.nationality,
  };
}

/** Partial edit of the caller's own descriptive profile (all fields optional). */
export type ProfilePatch = {
  avatarUrl?: string | null | undefined;
  affinity?: Partial<Record<string, number>> | undefined;
  attributes?: Record<string, number> | undefined;
  skills?: string[] | undefined;
  dominantFoot?: Foot | null | undefined;
  weakFoot?: number | null | undefined;
  skillMoves?: number | null | undefined;
  heightCm?: number | null | undefined;
  weightKg?: number | null | undefined;
  birthYear?: number | null | undefined;
  preferredTeam?: string | null | undefined;
  nationality?: string | null | undefined;
};

export interface PlayersRepository {
  /** Looks up a `Player` by id — backs `GET /players/:playerId/career` (F1-4). `null` for an unknown id. */
  findById(id: string): Promise<Player | null>;
  /**
   * Looks up a `Player` by its public `slug` — backs the slug-or-uuid
   * resolution `GET /players/:playerId/public-profile` does before calling
   * the service (see `public-profile.controller.ts`). `null` for an unknown
   * slug.
   */
  findBySlug(slug: string): Promise<Player | null>;
  /** Creates a brand new guest `Player` (`userId: null`) — never reused across groups. */
  createGuest(input: { name: string; phone?: string | null }): Promise<Player>;
  /**
   * Reuses the `Player` already linked to `userId` if one exists (a user's
   * identity is stable across the groups they belong to); otherwise creates
   * one from the `User` row's `name`. Race-safe (F1-5): the DB now enforces
   * "at most one `Player` per non-null `userId`" via a hand-written partial
   * unique index (`player_user_unique`, see that migration's header + the
   * `Player` model's doc comment) — two concurrent calls for the same
   * `userId` can both pass the `findFirst` check before either `create`
   * lands, so the loser's `create` gets a P2002 instead of a second row.
   * Caught below and turned into a re-`findFirst` for the winner's row,
   * rather than surfacing a 500. `Player.slug` (Task 1, share-carta) added a
   * SECOND unique constraint the same P2002 can come from (a 4-hex suffix
   * collision) — `createLinkedPlayer` tells the two apart by re-`findFirst`ing
   * on `userId` first and only retrying with a fresh slug when that comes up
   * empty (see its own comment).
   */
  findOrCreateForUser(userId: string): Promise<Player>;
  /**
   * Overwrites the provided fields of a player's own descriptive profile
   * (`affinity`/`attributes`/`skills`). Fields left `undefined` are untouched.
   */
  updateProfile(playerId: string, patch: ProfilePatch): Promise<Player>;
  /**
   * Case-insensitive name search over REGISTERED players (`userId` set) — backs
   * `GET /players/search`. Ordered by name, capped at `limit`.
   */
  searchByName(query: string, limit: number): Promise<Player[]>;
}

/** Factory `createPlayersRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createPlayersRepository(db: PrismaLike): PlayersRepository {
  return {
    async findById(id) {
      const row = await db.player.findUnique({ where: { id } });
      return row ? toDomainPlayer(row) : null;
    },

    async findBySlug(slug) {
      const row = await db.player.findUnique({ where: { slug } });
      return row ? toDomainPlayer(row) : null;
    },

    async createGuest(input) {
      const row = await retryOnSlugCollision(() =>
        db.player.create({
          data: {
            userId: null,
            name: input.name,
            phone: input.phone ?? null,
            slug: generateSlug(input.name, randomHex4),
          },
        }),
      );
      return toDomainPlayer(row);
    },

    async findOrCreateForUser(userId) {
      const existing = await db.player.findFirst({ where: { userId } });
      if (existing) return toDomainPlayer(existing);

      const userForCreate = await db.user.findUniqueOrThrow({ where: { id: userId } });
      return createLinkedPlayer(db, userId, userForCreate.name);
    },

    async updateProfile(playerId, patch) {
      const row = await db.player.update({
        where: { id: playerId },
        data: {
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
          ...(patch.affinity !== undefined
            ? { affinity: patch.affinity as unknown as Prisma.InputJsonValue }
            : {}),
          ...(patch.attributes !== undefined
            ? { attributes: patch.attributes as unknown as Prisma.InputJsonValue }
            : {}),
          ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
          ...(patch.dominantFoot !== undefined ? { dominantFoot: patch.dominantFoot } : {}),
          ...(patch.weakFoot !== undefined ? { weakFoot: patch.weakFoot } : {}),
          ...(patch.skillMoves !== undefined ? { skillMoves: patch.skillMoves } : {}),
          ...(patch.heightCm !== undefined ? { heightCm: patch.heightCm } : {}),
          ...(patch.weightKg !== undefined ? { weightKg: patch.weightKg } : {}),
          ...(patch.birthYear !== undefined ? { birthYear: patch.birthYear } : {}),
          ...(patch.preferredTeam !== undefined ? { preferredTeam: patch.preferredTeam } : {}),
          ...(patch.nationality !== undefined ? { nationality: patch.nationality } : {}),
        },
      });
      return toDomainPlayer(row);
    },

    async searchByName(query, limit) {
      const rows = await db.player.findMany({
        where: { userId: { not: null }, name: { contains: query, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: limit,
      });
      return rows.map(toDomainPlayer);
    },
  };
}

/**
 * Retries `attemptCreate` up to `MAX_SLUG_ATTEMPTS` whenever it throws a
 * P2002 (unique violation) — `attemptCreate` must generate a FRESH slug on
 * each call (via `generateSlug`/`randomHex4`) so a retry actually stands a
 * chance. Guards `createGuest`'s `slug` insert against the vanishingly rare
 * 4-hex collision (1/65536) rather than surfacing it as a 500.
 */
async function retryOnSlugCollision<T>(attemptCreate: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await attemptCreate();
    } catch (error) {
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation || attempt === MAX_SLUG_ATTEMPTS) throw error;
    }
  }
  // Unreachable (the loop always returns or throws), but keeps `tsc` happy
  // about every code path returning a value.
  throw new Error("retryOnSlugCollision: exhausted attempts without returning or throwing");
}

/** Shared body of `findOrCreateForUser`'s create path (kept race-safe, see interface doc). */
async function createLinkedPlayer(db: PrismaLike, userId: string, name: string): Promise<Player> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      const row = await db.player.create({
        data: { userId, name, phone: null, slug: generateSlug(name, randomHex4) },
      });
      return toDomainPlayer(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Two different unique constraints could be behind this P2002 now:
        // `player_user_unique` (the userId race this function is documented
        // to tolerate) or the new `Player_slug_key` (a 4-hex suffix
        // collision). Re-`findFirst` by `userId` distinguishes them cheaply:
        // if a row is there, the OTHER concurrent call won the userId race
        // and this IS its winner — return it. If not, this `create` failed
        // on a slug collision alone — regenerate and retry.
        const winner = await db.player.findFirst({ where: { userId } });
        if (winner) return toDomainPlayer(winner);
        if (attempt < MAX_SLUG_ATTEMPTS) continue;
      }
      throw error;
    }
  }
  // Unreachable (the loop always returns or throws), but keeps `tsc` happy
  // about every code path returning a value.
  throw new Error("createLinkedPlayer: exhausted attempts without returning or throwing");
}
