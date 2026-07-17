import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { isBillingConfigured } from "@/infra/stripe/client";
import { retrieveAccountStatus } from "@/infra/stripe/connect";
import { ERRORS } from "@/shared/errors/catalog";
import type { ConnectStatusResponse } from "../connect.schema";

export type GetConnectStatusDeps = { authRepo: AuthRepository };

/**
 * `GET /connect/status` — live Connect status for the caller. No
 * `stripeAccountId` yet means onboarding was never started: returns
 * `hasAccount:false` with every other field at its "nothing yet" default,
 * without calling Stripe. Otherwise defers to `retrieveAccountStatus` — never
 * cached (same rationale as entitlements: only the account id is persisted,
 * everything else is resolved live).
 */
export function createGetConnectStatusService(deps: GetConnectStatusDeps) {
  return async (userId: string): Promise<ConnectStatusResponse> => {
    if (!isBillingConfigured) throw ERRORS.CON.DISABLED();

    const user = await deps.authRepo.findById(userId);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();

    if (!user.stripeAccountId) {
      return {
        hasAccount: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      };
    }

    const status = await retrieveAccountStatus(user.stripeAccountId);
    return { hasAccount: true, ...status };
  };
}
