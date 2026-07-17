import { env } from "@/config/env";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { isBillingConfigured } from "@/infra/stripe/client";
import { createAccountLink, createConnectedAccount } from "@/infra/stripe/connect";
import { ERRORS } from "@/shared/errors/catalog";
import type { ConnectAccountLinkResponse } from "../connect.schema";

export type CreateConnectAccountDeps = { authRepo: AuthRepository };

/**
 * `POST /connect/account` — starts (or resumes) Stripe Connect Express
 * onboarding for a court owner and returns a fresh Account Link URL.
 * Idempotent: reuses `user.stripeAccountId` when present instead of creating
 * a second account, so calling this repeatedly (e.g. the owner re-opens the
 * onboarding screen) just refreshes the link. Config-gated
 * (`isBillingConfigured`) and soft-gated on the `quadra` role — mirrors
 * `VEN.ROLE_REQUIRED` (roles are self-declared intenção, not the security
 * boundary).
 */
export function createCreateConnectAccountService(deps: CreateConnectAccountDeps) {
  return async (userId: string): Promise<ConnectAccountLinkResponse> => {
    if (!isBillingConfigured) throw ERRORS.CON.DISABLED();

    const user = await deps.authRepo.findById(userId);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();
    if (!user.roles.includes("quadra")) throw ERRORS.CON.ROLE_REQUIRED();

    const accountId = user.stripeAccountId ?? (await createConnectedAccount(deps.authRepo, user));
    const url = await createAccountLink(accountId, {
      refreshUrl: `${env.WEB_BASE_URL}/quadra/pagamentos?refresh=1`,
      returnUrl: `${env.WEB_BASE_URL}/quadra/pagamentos?done=1`,
    });
    return { url };
  };
}
