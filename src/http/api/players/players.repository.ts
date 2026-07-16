import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import type { Player } from "./players.types";

type PlayerRow = {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  affinity: unknown;
};

function toDomainPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    affinity: (row.affinity ?? {}) as Record<string, number>,
  };
}

export interface PlayersRepository {
  /** Looks up a `Player` by id — backs `GET /players/:playerId/career` (F1-4). `null` for an unknown id. */
  findById(id: string): Promise<Player | null>;
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
   * rather than surfacing a 500.
   */
  findOrCreateForUser(userId: string): Promise<Player>;
  /** Overwrites a player's self-declared `affinity` map (`{position: 0-100}`). */
  updateAffinity(playerId: string, affinity: Record<string, number>): Promise<Player>;
}

/** Factory `createPlayersRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createPlayersRepository(db: PrismaLike): PlayersRepository {
  return {
    async findById(id) {
      const row = await db.player.findUnique({ where: { id } });
      return row ? toDomainPlayer(row) : null;
    },

    async createGuest(input) {
      const row = await db.player.create({
        data: {
          userId: null,
          name: input.name,
          phone: input.phone ?? null,
        },
      });
      return toDomainPlayer(row);
    },

    async findOrCreateForUser(userId) {
      const existing = await db.player.findFirst({ where: { userId } });
      if (existing) return toDomainPlayer(existing);

      const userForCreate = await db.user.findUniqueOrThrow({ where: { id: userId } });
      return createLinkedPlayer(db, userId, userForCreate.name);
    },

    async updateAffinity(playerId, affinity) {
      const row = await db.player.update({
        where: { id: playerId },
        data: { affinity: affinity as unknown as Prisma.InputJsonValue },
      });
      return toDomainPlayer(row);
    },
  };
}

/** Shared body of `findOrCreateForUser`'s create path (kept race-safe, see interface doc). */
async function createLinkedPlayer(db: PrismaLike, userId: string, name: string): Promise<Player> {
  try {
    const row = await db.player.create({ data: { userId, name, phone: null } });
    return toDomainPlayer(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // `player_user_unique` is the only unique constraint `Player` has
      // besides its own pkey (see that migration's header) — any P2002 out of
      // this `create` is exactly the concurrent-provisioning race
      // `findOrCreateForUser` is documented to tolerate. Re-find the winner.
      const winner = await db.player.findFirst({ where: { userId } });
      if (winner) return toDomainPlayer(winner);
    }
    throw error;
  }
}
