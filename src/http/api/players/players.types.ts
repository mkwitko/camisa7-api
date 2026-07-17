/**
 * Domain `Player` — not the Prisma row. A `Player` is either a registered
 * `User` (`userId` set, linked via `findOrCreateForUser`) or a guest added
 * directly by a group organizer (`userId` null, no login — see
 * `createGuest`). Reused across Task 5 (members), Task 7 (invite flow, which
 * links a guest `Player` to a real `User`), and beyond.
 *
 * `affinity` (Task 1, UX overhaul — FM rating model) is the player's OWN
 * self-declared affinity map (`{position: 0-100}`): the positions they play
 * and how good they judge themselves at each. Distinct from
 * `GroupMember.primaryPos`/`affinity`/`seedOverall` (a per-group rating an
 * owner still sets, consumed by the balancer). Empty (`{}`) until the
 * player declares it — never set by an organizer.
 */
import type { AttributeKey, SkillKey } from "./players.catalog";

export type Foot = "left" | "right" | "both";

export type Player = {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  affinity: Record<string, number>;
  /**
   * FIFA-style profile: the self-declared attribute budget (`{attribute: 0-99}`,
   * always the full 35-sub catalog — the repo fills the 50 baseline), up to
   * `MAX_SKILLS` playstyle tags, and the card fields below. Attributes DRIVE the
   * per-position overall (`players.rating.ts`); skills/card fields are
   * descriptive. See `players.catalog.ts`.
   */
  attributes: Record<AttributeKey, number>;
  skills: SkillKey[];
  dominantFoot: Foot | null;
  weakFoot: number | null;
  skillMoves: number | null;
  heightCm: number | null;
  weightKg: number | null;
  birthYear: number | null;
  preferredTeam: string | null;
  nationality: string | null;
};
