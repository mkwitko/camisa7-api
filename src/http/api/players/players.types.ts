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

export type Player = {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  affinity: Record<string, number>;
  /**
   * Onboarding profile (descriptive only, never feeds the balancer): the
   * self-declared attribute budget (`{attribute: 0-100}`, always the full
   * catalog — the repo fills the 50 baseline) and up to `MAX_SKILLS` skill
   * tags. See `players.catalog.ts`.
   */
  attributes: Record<AttributeKey, number>;
  skills: SkillKey[];
};
