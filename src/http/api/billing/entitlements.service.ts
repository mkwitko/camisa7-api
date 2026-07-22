import { env } from "@/config/env";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { FEATURE_KEYS, PLANS } from "./billing.catalog";
import type { SubscriptionsRepository } from "./subscription.repository";

export type EntitlementsService = {
  /** The set of feature keys the user is currently entitled to. */
  activeFeatures(userId: string): Promise<Set<string>>;
  /** True when the user has the given feature (reviewer bypass grants all). */
  hasFeature(userId: string, key: string): Promise<boolean>;
  /**
   * Whether in-app payment UI should be shown. `false` for reviewer accounts —
   * the app hides all payment surfaces so the store review sees no in-app
   * purchases (features still resolve as granted).
   */
  paymentsEnabled(userId: string): Promise<boolean>;
};

/**
 * Resolves entitlements from our own DB (the source of truth post-Woovi
 * migration): an `active` `Subscription` row grants `PLANS[plan].features`.
 *
 * Precedence in `activeFeatures`:
 * 1. unknown user → none;
 * 2. reviewer email (`REVIEWER_EMAILS`) → ALL features, no DB lookup;
 * 3. `env.ENTITLEMENTS_UNLOCK_ALL` (test/dev destrava-tudo) → ALL features;
 * 4. otherwise → `subscriptionsRepo.findActiveByUser`; `PLANS[sub.plan].features`
 *    if one is active, none otherwise.
 */
export function createEntitlementsService(deps: {
  authRepo: AuthRepository;
  subscriptionsRepo: SubscriptionsRepository;
}): EntitlementsService {
  function reviewerEmails(): string[] {
    return env.REVIEWER_EMAILS.split(",")
      .map((email) => email.trim())
      .filter(Boolean);
  }

  async function isReviewer(userId: string): Promise<boolean> {
    const user = await deps.authRepo.findById(userId);
    return user !== null && reviewerEmails().includes(user.email);
  }

  async function activeFeatures(userId: string): Promise<Set<string>> {
    const user = await deps.authRepo.findById(userId);
    if (!user) return new Set<string>();

    if (reviewerEmails().includes(user.email)) return new Set<string>(FEATURE_KEYS);

    // Destrava-tudo por env (teste/dev): concede todas as features sem
    // assinatura, pra validar fluxos pagos como o grupo público/Descobrir.
    // Off em produção.
    if (env.ENTITLEMENTS_UNLOCK_ALL) return new Set<string>(FEATURE_KEYS);

    const sub = await deps.subscriptionsRepo.findActiveByUser(userId);
    return sub ? new Set<string>(PLANS[sub.plan].features) : new Set<string>();
  }

  return {
    activeFeatures,

    async hasFeature(userId, key) {
      return (await activeFeatures(userId)).has(key);
    },

    async paymentsEnabled(userId) {
      // Reviewer → payments hidden. Everyone else (incl. unknown user) → on.
      return !(await isReviewer(userId));
    },
  };
}
