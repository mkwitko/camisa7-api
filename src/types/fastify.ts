import type { GoogleGateway } from "@/gateways/google/google.gateway";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { PushGateway } from "@/gateways/push/push.gateway";

/**
 * External gateways exposed via `app.gateways` (Fastify decorator). This
 * project has no AWS gateways (no Cognito/S3/SQS/SNS) — auth is own JWT (email/password) + Google,
 * never Cognito. `jwt` signs/verifies access + refresh tokens (Task 2); `google`
 * verifies Google Sign-In ID tokens (Task 3); `push` sends FCM notifications
 * (Task 12, waitlist promotion).
 */
export type Gateways = {
  jwt: JwtGateway;
  google: GoogleGateway;
  push: PushGateway;
};

declare module "fastify" {
  interface FastifyInstance {
    gateways: Gateways;
  }
}
