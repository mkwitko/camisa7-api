import { ERRORS } from "@/shared/errors/catalog";
import type { AuthRepository } from "../auth.repository";
import type { User } from "../auth.types";

export type MeDeps = { repo: AuthRepository };

export function createMeService(deps: MeDeps) {
  return async (userId: string): Promise<User> => {
    // Token was valid (authHook already verified it) but the user behind it
    // no longer exists (deleted account) — surface as unauthorized, not 404.
    const user = await deps.repo.findById(userId);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();
    return user;
  };
}
