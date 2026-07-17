/**
 * Domain `User` — not the Prisma row. `hasPassword` derives from
 * `passwordHash !== null` (Google-only accounts have no password); the raw
 * hash never leaves `auth.repository.ts` except on the `findByEmail` shape
 * consumed by the login service.
 */
export type User = {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  googleSub: string | null;
  /** Última localização conhecida do jogador (Geo G1) — default de ranking por cidade. */
  lastCity: string | null;
  lastLat: number | null;
  lastLng: number | null;
  /**
   * Stripe customer id (billing correlation). Internal — never exposed on
   * `UserResponse`. `null` until the user first hits checkout/portal (see
   * `getOrCreateCustomer`). The only billing state we persist.
   */
  stripeCustomerId: string | null;
  createdAt: string;
};
