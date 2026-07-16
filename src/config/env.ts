import { z } from "zod/v4";

/** Service identity used in logs and the OpenAPI document. Not an env var. */
export const SERVICE_NAME = "futebol-api";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().min(1).default("15m"),
  JWT_REFRESH_TTL: z.string().min(1).default("30d"),

  GOOGLE_CLIENT_IDS: z.string().min(1),
  // Path to the Firebase service-account JSON, read by firebase-admin's
  // Application Default Credentials. Optional: when unset, push is a no-op.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// Zod é a fonte do schema. `z.coerce.*` converte string -> number; `.default()`
// preenche ausentes. `safeParse` agrega os erros num relatório único.
export function parseEnv(raw: Record<string, string | undefined>): EnvConfig {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid env: ${msg}`);
  }
  return result.data;
}

// Singleton lazy: validado no PRIMEIRO acesso a `env`, não no import — assim
// testes que setam process.env antes de importar não quebram em import-time.
let cachedEnv: EnvConfig | undefined;
export const env: EnvConfig = new Proxy({} as EnvConfig, {
  get(_target, prop) {
    cachedEnv ??= parseEnv(process.env as Record<string, string | undefined>);
    return (cachedEnv as Record<string | symbol, unknown>)[prop];
  },
});
