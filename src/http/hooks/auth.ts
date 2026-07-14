import type { FastifyRequest } from "fastify";
import { ERRORS } from "@/shared/errors/catalog";

const BEARER_PREFIX = "Bearer ";

function extractBearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) return undefined;
  return header.slice(BEARER_PREFIX.length);
}

/**
 * Global `preHandler` (wired once in `src/http/index.ts`, applies to every
 * route registered under that scope). Verifies `Authorization: Bearer
 * <accessToken>` via `app.gateways.jwt.verifyAccess` and sets `req.user`.
 * Short-circuits when the route declares `config: { public: true }` (e.g.
 * `/health`, `POST /auth/register`, `POST /auth/login`).
 *
 * No `permissionsHook` here (unlike the company skill's Cognito + persona
 * pattern) — this project's authorization is ownership-based, added per
 * use-case in later tasks, not a persona catalog.
 */
export async function authHook(req: FastifyRequest): Promise<void> {
  if (req.routeOptions.config.public === true) return;

  const token = extractBearerToken(req);
  if (!token) throw ERRORS.AUTH.UNAUTHORIZED();

  const { sub } = await req.server.gateways.jwt.verifyAccess(token);
  req.user = { userId: sub };
}

/** Reads the identity set by `authHook`. Throws `AUTH.UNAUTHORIZED` if missing. */
export function requireUser(req: FastifyRequest): { userId: string } {
  if (!req.user) throw ERRORS.AUTH.UNAUTHORIZED();
  return req.user;
}
