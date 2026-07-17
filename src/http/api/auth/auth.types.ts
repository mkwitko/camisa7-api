/**
 * Marketplace V1: account types a `User` opts into (multi). Mirrors the Prisma
 * `Role` enum as a plain string union (same rationale as `MatchStatus`/
 * `Modality`: callers don't depend on the generated client's types). Roles are
 * intenção/feature-unlock, NÃO fronteira de autorização — o backend segue
 * autorizando por ownership + entitlements.
 */
export type Role = "jogador" | "organizador" | "quadra";

/**
 * Domain `User` — not the Prisma row. `hasPassword` derives from
 * `passwordHash !== null` (Google-only accounts have no password); the raw
 * hash never leaves `auth.repository.ts` except on the `findByEmail` shape
 * consumed by the login service. `roles` (Marketplace V1) are the account
 * types the user opted into — always at least `["jogador"]`.
 */
export type User = {
  id: string;
  email: string;
  name: string;
  roles: Role[];
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
  /**
   * Marketplace V2: Stripe Connect (Express) account id for a court owner —
   * the destination of `transfer_data.destination` on booking PaymentIntents.
   * `null` until the owner starts onboarding (`createConnectedAccount`).
   * `charges_enabled`/`payouts_enabled` are resolved live from Stripe
   * (`retrieveAccountStatus`), not persisted here.
   */
  stripeAccountId: string | null;
  createdAt: string;
};
