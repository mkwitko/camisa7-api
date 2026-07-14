import type { PrismaLike } from "@/infra/db/client";
import type { Player } from "./players.types";

type PlayerRow = {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
};

function toDomainPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
  };
}

export interface PlayersRepository {
  /** Creates a brand new guest `Player` (`userId: null`) — never reused across groups. */
  createGuest(input: { name: string; phone?: string | null }): Promise<Player>;
  /**
   * Reuses the `Player` already linked to `userId` if one exists (a user's
   * identity is stable across the groups they belong to); otherwise creates
   * one from the `User` row's `name`.
   */
  findOrCreateForUser(userId: string): Promise<Player>;
}

/** Factory `createPlayersRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createPlayersRepository(db: PrismaLike): PlayersRepository {
  return {
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

      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const row = await db.player.create({
        data: { userId, name: user.name, phone: null },
      });
      return toDomainPlayer(row);
    },
  };
}
