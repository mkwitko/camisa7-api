import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";

/**
 * External gateways exposed via `app.gateways` (Fastify decorator) — see the
 * b2b-reservas-backend skill's ARCHITECTURE.md §4. This project has no AWS
 * gateways (no Cognito/S3/SQS/SNS) — auth is own JWT (email/password) + Google
 * later, never Cognito. `jwt` signs/verifies access + refresh tokens (Task 2).
 * Later tasks add `google`, `push` as fields here.
 */
export type Gateways = {
  jwt: JwtGateway;
};

declare module "fastify" {
  interface FastifyInstance {
    gateways: Gateways;
  }
}
