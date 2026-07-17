import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { Role, User } from "./auth.types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  passwordHash: string | null;
  googleSub: string | null;
  lastCity: string | null;
  lastLat: number | null;
  lastLng: number | null;
  stripeCustomerId: string | null;
  stripeAccountId: string | null;
  createdAt: Date;
};

function toDomainUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: row.roles,
    hasPassword: row.passwordHash !== null,
    googleSub: row.googleSub,
    lastCity: row.lastCity ?? null,
    lastLat: row.lastLat ?? null,
    lastLng: row.lastLng ?? null,
    stripeCustomerId: row.stripeCustomerId ?? null,
    stripeAccountId: row.stripeAccountId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The columns behind a Prisma P2002 (unique constraint violation) — shape
 * differs by engine. Query-engine mode reports `meta.target` (column array,
 * or a constraint-name string on some databases); this project runs on the
 * `@prisma/adapter-pg` driver adapter (`engineType = "client"`, see
 * `prisma/schema.prisma`), which instead nests it under
 * `meta.driverAdapterError.cause.constraint.fields`.
 */
function conflictingColumns(meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return [];

  const target = meta.target;
  if (Array.isArray(target)) return target.filter((t): t is string => typeof t === "string");
  if (typeof target === "string") return [target];

  const cause = isRecord(meta.driverAdapterError) ? meta.driverAdapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  const fields = isRecord(constraint) ? constraint.fields : undefined;
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === "string") : [];
}

/** True when a Prisma P2002 (unique constraint) error is about `User.email`. */
function isEmailConflict(
  error: InstanceType<typeof Prisma.PrismaClientKnownRequestError>,
): boolean {
  return conflictingColumns(error.meta).includes("email");
}

export interface AuthRepository {
  findByEmail(email: string): Promise<(User & { passwordHash: string | null }) | null>;
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  insert(input: {
    email: string;
    name: string;
    passwordHash?: string;
    googleSub?: string;
    /** Marketplace V1: account types opted into at register. Defaults to `["jogador"]` when omitted. */
    roles?: Role[];
  }): Promise<User>;
  /** Links a Google account to an existing (password) user — Google login on a known email. */
  linkGoogle(id: string, googleSub: string): Promise<void>;
  /** Marketplace V1: replaces the caller's account types, from `PATCH /auth/me/roles`. Returns the updated `User`. */
  setRoles(id: string, roles: Role[]): Promise<User>;
  /** Task 12: sets (or clears, via `null`) the caller's Expo push token, from `PATCH /auth/me/push-token`. */
  setPushToken(id: string, token: string | null): Promise<void>;
  /**
   * Task 12: reads a user's Expo push token — a narrow lookup separate from
   * `findById`/`User` on purpose, so the token (an external-service secret,
   * not user-facing data) never leaks into `UserResponse`. Used by
   * `cancel-presence.service` to decide whether a promoted player's linked
   * user has push enabled.
   */
  getPushToken(id: string): Promise<string | null>;
  /**
   * Geo (G1): grava a última localização conhecida do jogador
   * (`lastCity/lastLat/lastLng`), de `PUT /me/location`. `lat`/`lng` opcionais
   * (cidade manual = só `city`). Retorna o `User` atualizado.
   */
  setLocation(
    id: string,
    input: { lat?: number | undefined; lng?: number | undefined; city: string },
  ): Promise<User>;
  /**
   * Billing: persists the Stripe customer id for a user (from
   * `getOrCreateCustomer`, on first checkout/portal). The only billing write
   * we do — entitlements themselves live in Stripe, not here.
   */
  setStripeCustomerId(id: string, stripeCustomerId: string): Promise<void>;
  /**
   * Marketplace V2: persists the Stripe Connect (Express) account id for a
   * court owner (from `createConnectedAccount`, on onboarding start). Same
   * shape as `setStripeCustomerId` — the id is the only Connect state we
   * store; `charges_enabled`/etc. are resolved live from Stripe.
   */
  setStripeAccountId(id: string, stripeAccountId: string): Promise<void>;
}

/** Factory `createAuthRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createAuthRepository(db: PrismaLike): AuthRepository {
  return {
    async findByEmail(email) {
      const row = await db.user.findUnique({ where: { email } });
      if (!row) return null;
      return { ...toDomainUser(row), passwordHash: row.passwordHash };
    },

    async findById(id) {
      const row = await db.user.findUnique({ where: { id } });
      return row ? toDomainUser(row) : null;
    },

    async findByGoogleSub(googleSub) {
      const row = await db.user.findUnique({ where: { googleSub } });
      return row ? toDomainUser(row) : null;
    },

    async linkGoogle(id, googleSub) {
      await db.user.update({ where: { id }, data: { googleSub } });
    },

    async setRoles(id, roles) {
      const row = await db.user.update({ where: { id }, data: { roles } });
      return toDomainUser(row);
    },

    async setPushToken(id, token) {
      await db.user.update({ where: { id }, data: { expoPushToken: token } });
    },

    async getPushToken(id) {
      const row = await db.user.findUnique({
        where: { id },
        select: { expoPushToken: true },
      });
      return row?.expoPushToken ?? null;
    },

    async setLocation(id, input) {
      const row = await db.user.update({
        where: { id },
        data: {
          lastCity: input.city,
          lastLat: input.lat ?? null,
          lastLng: input.lng ?? null,
        },
      });
      return toDomainUser(row);
    },

    async setStripeCustomerId(id, stripeCustomerId) {
      await db.user.update({ where: { id }, data: { stripeCustomerId } });
    },

    async setStripeAccountId(id, stripeAccountId) {
      await db.user.update({ where: { id }, data: { stripeAccountId } });
    },

    async insert(input) {
      try {
        const row = await db.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash ?? null,
            googleSub: input.googleSub ?? null,
            ...(input.roles ? { roles: input.roles } : {}),
          },
        });
        return toDomainUser(row);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          isEmailConflict(error)
        ) {
          throw ERRORS.AUTH.EMAIL_TAKEN();
        }
        throw error;
      }
    },
  };
}
