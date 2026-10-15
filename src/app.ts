import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { env } from "@/config/env";
import { httpRoutes } from "@/http/index";
import { errorHandlerPlugin } from "@/http/plugins/error-handler/error-handler";
import { gatewaysPlugin } from "@/http/plugins/gateways-plugin/gateways-plugin";
import { swaggerPlugin } from "@/http/plugins/swagger/swagger";
import { logger } from "@/infra/observability/logger";
import type { Gateways } from "@/types/fastify";

export type BuildAppOptions = {
  gateways?: Gateways;
  // Aceito desde já para estabilizar a assinatura de `buildApp` entre tasks,
  // mas ainda sem efeito: @fastify/rate-limit entra numa task futura (ver
  // CODING_STANDARDS.md §5.3 das convenções do backend) — Task 0 não o instala.
  rateLimit?: boolean;
};

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: env.TRUST_PROXY_HOPS, // hops confiáveis (ALB), nunca `true`
    bodyLimit: 1_048_576,
  });

  // Zod como fonte da verdade: validação + serialização compiladas via type provider.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible); // 1. utilitários
  await app.register(helmet); // 2. segurança
  await app.register(cors, {
    origin: env.NODE_ENV === "development",
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"],
  });
  await app.register(errorHandlerPlugin); // 3. error handler global
  // exactOptionalPropertyTypes: só inclui a chave quando há override (evita
  // passar `gateways: undefined` explícito para um campo opcional).
  await app.register(gatewaysPlugin, opts.gateways ? { gateways: opts.gateways } : {}); // 4. gateways
  await app.register(swaggerPlugin); // 5. OpenAPI + Swagger UI (antes das rotas)
  // 5.1 raw body (opt-in por rota via `config: { rawBody: true }`) — o webhook
  // do Stripe precisa do corpo cru pra validar a assinatura. `global: false`
  // mantém todas as outras rotas com o parsing normal (JSON via zod).
  await app.register(rawBody, { global: false });
  await app.register(httpRoutes); // 6. rotas

  return app;
}
