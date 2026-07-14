import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";

/**
 * Issues an access + refresh token pair for `userId` in one call. Shared by
 * register/login/login-google/refresh so the pairing (same `sub`, signed
 * concurrently) stays in one place instead of drifting across the four call
 * sites.
 */
export async function signTokenPair(
  jwt: JwtGateway,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    jwt.signAccess({ sub: userId }),
    jwt.signRefresh({ sub: userId }),
  ]);

  return { accessToken, refreshToken };
}
