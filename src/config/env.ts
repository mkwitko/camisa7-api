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

  // Cloudflare R2 (S3-compatible object storage) — avatares/mídia via presigned
  // upload. Todos opcionais: quando faltam, o upload é no-op (feature desligada),
  // igual ao push. `R2_PUBLIC_URL` é a base pública (dev r2.dev ou domínio) que
  // vira o `avatarUrl` salvo. `R2_ENDPOINT` é o endpoint S3 da conta (sem bucket).
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Stripe billing + entitlements. Todos opcionais/config-gated: sem
  // `STRIPE_SECRET_KEY` o billing fica OFF (`/billing/*` → 503, `hasFeature`
  // false), igual R2/push. `STRIPE_WEBHOOK_SECRET` valida a assinatura do
  // `POST /webhooks/stripe`. `STRIPE_PRICE_*` são os price ids dos planos.
  // `REVIEWER_EMAILS` (csv) é a allowlist de contas revisoras das lojas: quem
  // está na lista recebe todas as features e `paymentsEnabled: false` (o app
  // esconde toda UI de pagamento). `APP_DEEPLINK_SCHEME` é o scheme dos
  // deep-links de retorno do checkout/portal.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ORGANIZER: z.string().optional(),
  STRIPE_PRICE_PLAYER: z.string().optional(),
  REVIEWER_EMAILS: z.string().default(""),
  APP_DEEPLINK_SCHEME: z.string().default("futebolapp"),

  // Marketplace V2 (booking + Stripe Connect): a platform fee cobrada em cima
  // do `application_fee_amount` de cada PaymentIntent com destino ao
  // `stripeAccountId` do dono da quadra. `PLATFORM_FEE_BPS` (basis points,
  // 500 = 5%) e `PLATFORM_FEE_MIN_CENTS` (piso em centavos) combinam como
  // `max(priceCents * PLATFORM_FEE_BPS / 10000, PLATFORM_FEE_MIN_CENTS)`.
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(500),
  PLATFORM_FEE_MIN_CENTS: z.coerce.number().int().min(0).default(200),

  // Base URL of the web app (Vite dev server in dev), used to build the
  // `refresh_url`/`return_url` of Stripe Connect Account Links — the owner is
  // sent back there after (or mid-) onboarding.
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
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
