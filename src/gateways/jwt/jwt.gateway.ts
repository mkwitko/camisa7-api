import { jwtVerify, SignJWT } from "jose";
import { AppError } from "@/shared/errors/app-error";
import { ERRORS } from "@/shared/errors/catalog";

const ALG = "HS256";

export type JwtGateway = {
  signAccess(claims: { sub: string }): Promise<string>;
  signRefresh(claims: { sub: string }): Promise<string>;
  verifyAccess(token: string): Promise<{ sub: string }>;
  verifyRefresh(token: string): Promise<{ sub: string }>;
};

export type JwtGatewayConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
};

async function sign(secretKey: Uint8Array, sub: string, ttl: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey);
}

async function verify(secretKey: Uint8Array, token: string): Promise<{ sub: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.sub !== "string") throw ERRORS.AUTH.INVALID_TOKEN();
    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Any jose failure (bad signature, malformed, expired — see jose's
    // `errors.JWTExpired`/`JWSSignatureVerificationFailed`) surfaces as the
    // same typed 401, per ERRORS.md — callers never see jose's error shape.
    throw ERRORS.AUTH.INVALID_TOKEN();
  }
}

/**
 * Own JWT auth (HS256 via `jose`) — no Cognito. `sub` is always the domain
 * `User.id` (uuid). Access + refresh use separate secrets so a leaked refresh
 * token can't be replayed as an access token and vice versa.
 */
export function createJwtGateway(config: JwtGatewayConfig): JwtGateway {
  const accessSecret = new TextEncoder().encode(config.accessSecret);
  const refreshSecret = new TextEncoder().encode(config.refreshSecret);

  return {
    signAccess: ({ sub }) => sign(accessSecret, sub, config.accessTtl),
    signRefresh: ({ sub }) => sign(refreshSecret, sub, config.refreshTtl),
    verifyAccess: (token) => verify(accessSecret, token),
    verifyRefresh: (token) => verify(refreshSecret, token),
  };
}
