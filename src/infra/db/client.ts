import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/config/env";
import { type Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Singleton PrismaClient bound to the pg driver adapter (Prisma 7 requires a
 * driver adapter with `engineType = "client"` — no query engine binary).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/**
 * Repository factories accept `PrismaLike` so they compose inside an
 * interactive transaction (`tx`) or run standalone against the singleton.
 */
export type PrismaLike = PrismaClient | Prisma.TransactionClient;
