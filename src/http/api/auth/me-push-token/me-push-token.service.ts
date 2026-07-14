import type { AuthRepository } from "../auth.repository";

export type UpdatePushTokenDeps = { repo: AuthRepository };

/**
 * Sets (or clears, via `null`) the caller's Expo push token — registered by
 * the app on login/permission-grant, cleared on logout/permission-revoke.
 * No validation of the token's shape: an invalid/stale token is simply a
 * silent no-op at send time (`PushGateway.send`'s no-op-on-empty +
 * catch-and-log contract), never a reason to reject this request.
 */
export function createUpdatePushTokenService(deps: UpdatePushTokenDeps) {
  return async (userId: string, expoPushToken: string | null): Promise<void> => {
    await deps.repo.setPushToken(userId, expoPushToken);
  };
}
