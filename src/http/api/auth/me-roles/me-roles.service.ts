import type { AuthRepository } from "../auth.repository";
import type { Role, User } from "../auth.types";

export type UpdateMeRolesDeps = { repo: AuthRepository };

/**
 * Marketplace V1: replaces the caller's account types (`PATCH /auth/me/roles`).
 * Roles are intenção/feature-unlock (marking `quadra` unlocks the web venue
 * dashboard, `organizador` the group/match creation flow) — NÃO fronteira de
 * autorização, so this is a plain owner-scoped self-update with no entitlement
 * gate. Dedup isn't enforced here: the DB column is a plain enum array, the Zod
 * body only guarantees ≥1 role.
 */
export function createUpdateMeRolesService(deps: UpdateMeRolesDeps) {
  return async (userId: string, roles: Role[]): Promise<User> => {
    return deps.repo.setRoles(userId, roles);
  };
}
