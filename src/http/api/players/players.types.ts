/**
 * Domain `Player` — not the Prisma row. A `Player` is either a registered
 * `User` (`userId` set, linked via `findOrCreateForUser`) or a guest added
 * directly by a group organizer (`userId` null, no login — see
 * `createGuest`). Reused across Task 5 (members), Task 7 (invite flow, which
 * links a guest `Player` to a real `User`), and beyond.
 */
export type Player = {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
};
