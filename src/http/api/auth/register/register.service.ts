import argon2 from "argon2";
import type { JwtGateway } from "@/gateways/jwt/jwt.gateway";
import { ERRORS } from "@/shared/errors/catalog";
import type { AuthRepository } from "../auth.repository";
import type { AuthResponse } from "../auth.schema";
import type { RegisterBody } from "./register.schema";

export type RegisterDeps = {
  repo: AuthRepository;
  jwt: JwtGateway;
};

export function createRegisterService(deps: RegisterDeps) {
  return async (input: RegisterBody): Promise<AuthResponse> => {
    const existing = await deps.repo.findByEmail(input.email);
    if (existing) throw ERRORS.AUTH.EMAIL_TAKEN();

    const passwordHash = await argon2.hash(input.password);
    const user = await deps.repo.insert({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    const [accessToken, refreshToken] = await Promise.all([
      deps.jwt.signAccess({ sub: user.id }),
      deps.jwt.signRefresh({ sub: user.id }),
    ]);

    return { accessToken, refreshToken, user };
  };
}
