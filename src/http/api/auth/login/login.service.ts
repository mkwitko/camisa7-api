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

// Precomputed argon2 hash of a throwaway password, used only to pay the same
// argon2 cost on the "user not found" / "google-only account" paths as on a
// real password check. Without this, those paths return after a DB lookup
// with no argon2 call, and the latency gap lets a prober distinguish
// "email exists with password" from "doesn't exist / google-only" even
// though all three cases throw the same AUTH-T0003 error.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$X3M0M08rGkY9WMoIzMlLtQ$Rf0GS+MTIQhLM+r6EAtV3xIqXGnW3D0uWrxa+O6oOAI";

export function createLoginService(deps: LoginDeps) {
  return async (input: LoginBody): Promise<AuthResponse> => {
    const found = await deps.repo.findByEmail(input.email);
    // Null `passwordHash` = Google-only account (no local password set yet) —
    // same 401 as a wrong password, so a probe can't distinguish the two.
    if (!found?.passwordHash) {
      await argon2.verify(DUMMY_PASSWORD_HASH, input.password);
      throw ERRORS.AUTH.INVALID_CREDENTIALS();
    }

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
