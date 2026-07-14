import type { GoogleGateway } from "@/gateways/google/google.gateway";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import type { AuthRepository } from "../auth.repository";
import type { AuthResponse } from "../auth.schema";
import type { User } from "../auth.types";
import type { LoginGoogleBody } from "./login-google.schema";

export type LoginGoogleDeps = {
  repo: AuthRepository;
  jwt: JwtGateway;
  google: GoogleGateway;
};

/**
 * Google Sign-In: verify the ID token, then resolve the domain user by one of
 * three paths (in order):
 * 1. `findByGoogleSub` — returning google user, sign tokens.
 * 2. `findByEmail` — first google login on an email that already has a
 *    (password) account: link (`linkGoogle`) instead of creating a duplicate
 *    row: same identity, now with two sign-in methods. `hasPassword` still
 *    reflects the pre-existing password.
 * 3. Neither — brand-new account, `insert` with no `passwordHash`
 *    (`hasPassword: false`).
 */
export function createLoginGoogleService(deps: LoginGoogleDeps) {
  return async (input: LoginGoogleBody): Promise<AuthResponse> => {
    const { googleSub, email, name } = await deps.google.verifyIdToken(input.idToken);

    const user = await resolveUser(deps, { googleSub, email, name });

    const [accessToken, refreshToken] = await Promise.all([
      deps.jwt.signAccess({ sub: user.id }),
      deps.jwt.signRefresh({ sub: user.id }),
    ]);

    return { accessToken, refreshToken, user };
  };
}

async function resolveUser(
  deps: LoginGoogleDeps,
  claims: { googleSub: string; email: string; name: string },
): Promise<User> {
  const byGoogle = await deps.repo.findByGoogleSub(claims.googleSub);
  if (byGoogle) return byGoogle;

  const byEmail = await deps.repo.findByEmail(claims.email);
  if (byEmail) {
    await deps.repo.linkGoogle(byEmail.id, claims.googleSub);
    const { passwordHash: _passwordHash, ...user } = byEmail;
    return { ...user, googleSub: claims.googleSub };
  }

  return deps.repo.insert({ email: claims.email, name: claims.name, googleSub: claims.googleSub });
}
