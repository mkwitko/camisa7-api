import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { User } from "./auth.types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  googleSub: string | null;
  createdAt: Date;
};

function toDomainUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    hasPassword: row.passwordHash !== null,
    googleSub: row.googleSub,
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
  }): Promise<User>;
  /** Links a Google account to an existing (password) user — Google login on a known email. */
  linkGoogle(id: string, googleSub: string): Promise<void>;
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

    async insert(input) {
      try {
        const row = await db.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash ?? null,
            googleSub: input.googleSub ?? null,
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
