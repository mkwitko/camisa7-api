import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import { ERRORS } from "@/shared/errors/catalog";
import type { AuthRepository } from "../auth.repository";
import type { AuthResponse } from "../auth.schema";
import type { RefreshBody } from "./refresh.schema";

export type RefreshDeps = {
  repo: AuthRepository;
  jwt: JwtGateway;
};

/**
 * Rotates a refresh token: `verifyRefresh` throws `AUTH-T0001` on a
 * bad/expired/garbage token (jwt.gateway.ts). A verified-but-stale token
 * (user deleted since it was issued) is rejected with `AUTH-T0004`
 * (unauthorized), not `AUTH-T0001` — the token itself was valid, the subject
 * just no longer exists.
 */
export function createRefreshService(deps: RefreshDeps) {
  return async (input: RefreshBody): Promise<AuthResponse> => {
    const { sub } = await deps.jwt.verifyRefresh(input.refreshToken);

    const user = await deps.repo.findById(sub);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();

    const [accessToken, refreshToken] = await Promise.all([
      deps.jwt.signAccess({ sub: user.id }),
      deps.jwt.signRefresh({ sub: user.id }),
    ]);

    return { accessToken, refreshToken, user };
  };
}
