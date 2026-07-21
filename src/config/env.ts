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
  // Destrava TODAS as features de entitlement pra qualquer usuário — só pra
  // teste/dev (ex. validar o Descobrir sem Stripe configurado). Em produção
  // fica `false`: aí `public_groups` etc. seguem pagos e o app mostra o
  // paywall pra quem não tem o plano. Aceita "true"/"1".
  ENTITLEMENTS_UNLOCK_ALL: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
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

  // Growth reporting: shared-secret bearer token that gates `GET
  // /api/growth/metrics` (server-to-server, consumed by the growth-os
  // pipeline). Optional/config-gated, same convention as R2/Stripe: unset ->
  // the route 503s instead of running unauthenticated.
  GROWTH_SERVICE_TOKEN: z.string().optional(),

  // Share-carta smart-link shell (`/j/:slug`, Fase 1 Task 5): `PUBLIC_WEB_URL`
  // is the futebol-web origin the redirect/OG `og:url` fall back to,
  // `PUBLIC_API_URL` is this API's own public origin used to build the
  // `/og/*` image URLs embedded in the page's meta tags. `APP_UNIVERSAL_HOST`
  // reserved for the future universal-link host; `IOS_APP_STORE_URL`/
  // `ANDROID_STORE_URL` are the store fallbacks the smart-link script opens
  // when the app isn't installed. All default to real-looking placeholders
  // so boot/tests never fail on a missing var — same convention as
  // `APP_DEEPLINK_SCHEME`/`WEB_BASE_URL` above.
  PUBLIC_WEB_URL: z.string().url().default("https://camisa7.app"),
  PUBLIC_API_URL: z.string().url().default("https://camisa7.app"),
  APP_UNIVERSAL_HOST: z.string().default("camisa7.app"),
  IOS_APP_STORE_URL: z.string().url().default("https://apps.apple.com/app/id000000000"),
  ANDROID_STORE_URL: z
    .string()
    .url()
    .default("https://play.google.com/store/apps/details?id=app.camisa7"),

  // Universal/app-link domain association (Fase 1 Task 6): `.well-known/
  // apple-app-site-association` (iOS) and `.well-known/assetlinks.json`
  // (Android) — read by the OS, not a browser, to let `/j/:slug` open the app
  // instead of (or alongside) the web fallback. `IOS_APP_ID` is
  // `<TeamID>.<bundle id>`; `ANDROID_PACKAGE` the app's applicationId;
  // `ANDROID_SHA256` the release signing cert fingerprint (colon-separated
  // hex) — empty default omits it, since a wrong fingerprint would just make
  // Android reject the association (fails safe, same "default to a
  // real-looking placeholder" convention as the other share-carta vars above).
  // NOTE: the app's real bundle id / applicationId (both platforms) is
  // `com.mauriciooliveira.futebolapp` (see futebol-app `app.config.ts`). The
  // iOS `<TeamID>.` prefix and the Android release-cert `ANDROID_SHA256` are
  // still deploy-time secrets — production MUST override IOS_APP_ID with the
  // real Team ID and set ANDROID_SHA256, or universal/app links won't verify.
  IOS_APP_ID: z.string().default("TEAMID.com.mauriciooliveira.futebolapp"),
  ANDROID_PACKAGE: z.string().default("com.mauriciooliveira.futebolapp"),
  ANDROID_SHA256: z.string().default(""),
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
