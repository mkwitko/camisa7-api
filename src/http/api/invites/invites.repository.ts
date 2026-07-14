import { nanoid } from "nanoid";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import type { PrismaLike } from "@/infra/db/client";

const TOKEN_LENGTH = 16;

export interface InviteRepository {
  /**
   * Mints a shareable invite token for `matchId` — reuses the existing row
   * for that match if one already exists (steady state is one active token
   * per match) instead of minting a fresh one on every call.
   */
  create(matchId: string): Promise<{ token: string }>;
  /**
   * Resolves a guest-submitted `token` to its `Match` + parent group name.
   * Returns `null` for an unknown token, or if the token's match/group has
   * since been deleted (shouldn't happen given the FK, but defensive) — the
   * caller (both public routes) turns that into `ERRORS.INV.INVALID_TOKEN()`.
   * Delegates to `MatchesRepository`/`GroupsRepository` rather than
   * duplicating their row->domain mapping.
   */
  resolveActive(token: string): Promise<{ match: Match; groupName: string } | null>;
}

/** Factory `createInviteRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createInviteRepository(db: PrismaLike): InviteRepository {
  return {
    async create(matchId) {
      const existing = await db.inviteToken.findFirst({ where: { matchId } });
      if (existing) return { token: existing.token };

      const row = await db.inviteToken.create({
        data: { matchId, token: nanoid(TOKEN_LENGTH) },
      });
      return { token: row.token };
    },

    async resolveActive(token) {
      const row = await db.inviteToken.findUnique({ where: { token } });
      if (!row) return null;

      const match = await createMatchesRepository(db).findById(row.matchId);
      if (!match) return null;

      const group = await createGroupsRepository(db).findById(match.groupId);
      if (!group) return null;

      return { match, groupName: group.name };
    },
  };
}
