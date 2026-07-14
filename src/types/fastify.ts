/**
 * External gateways exposed via `app.gateways` (Fastify decorator) — see the
 * b2b-reservas-backend skill's ARCHITECTURE.md §4. Empty in Task 0 on purpose:
 * this project has no AWS gateways (no Cognito/S3/SQS/SNS). Later tasks add
 * `jwt`, `google`, `push` as fields here.
 */
export type Gateways = Record<string, never>;

declare module "fastify" {
  interface FastifyInstance {
    gateways: Gateways;
  }
}
