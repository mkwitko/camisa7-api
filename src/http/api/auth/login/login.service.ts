import argon2 from "argon2";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import { ERRORS } from "@/shared/errors/catalog";
import type { AuthRepository } from "../auth.repository";
import type { AuthResponse } from "../auth.schema";
import type { LoginBody } from "./login.schema";

export type LoginDeps = {
  repo: AuthRepository;
  jwt: JwtGateway;
};

export function createLoginService(deps: LoginDeps) {
  return async (input: LoginBody): Promise<AuthResponse> => {
    const found = await deps.repo.findByEmail(input.email);
    // Null `passwordHash` = Google-only account (no local password set yet) —
    // same 401 as a wrong password, so a probe can't distinguish the two.
    if (!found?.passwordHash) throw ERRORS.AUTH.INVALID_CREDENTIALS();

    const valid = await argon2.verify(found.passwordHash, input.password);
    if (!valid) throw ERRORS.AUTH.INVALID_CREDENTIALS();

    const { passwordHash: _passwordHash, ...user } = found;

    const [accessToken, refreshToken] = await Promise.all([
      deps.jwt.signAccess({ sub: user.id }),
      deps.jwt.signRefresh({ sub: user.id }),
    ]);

    return { accessToken, refreshToken, user };
  };
}
