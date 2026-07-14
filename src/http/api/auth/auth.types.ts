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
  createdAt: string;
};
