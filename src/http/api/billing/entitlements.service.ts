import { env } from "@/config/env";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { isBillingConfigured, stripe } from "@/infra/stripe/client";
import { FEATURE_KEYS } from "./billing.catalog";

/** In-memory cache TTL for a customer's active entitlements. */
const CACHE_TTL_MS = 60_000;

export type EntitlementsService = {
  /** The set of feature `lookup_key`s the user is currently entitled to. */
  activeFeatures(userId: string): Promise<Set<string>>;
  /** True when the user has the given feature (reviewer bypass grants all). */
  hasFeature(userId: string, key: string): Promise<boolean>;
  /**
   * Whether in-app payment UI should be shown. `false` for reviewer accounts —
   * the app hides all payment surfaces so the store review sees no in-app
   * purchases (features still resolve as granted).
   */
  paymentsEnabled(userId: string): Promise<boolean>;
  /** Drops the cached entitlements for a customer (called from the webhook). */
  invalidate(customerId: string): void;
};

/**
 * Resolves entitlements from Stripe (the source of truth) with a short
 * in-memory cache, plus the store-reviewer bypass.
 *
 * Precedence in `activeFeatures`:
 * 1. reviewer email (`REVIEWER_EMAILS`) → ALL features, no Stripe call;
 * 2. billing not configured → none;
 * 3. no Stripe customer yet (free user, never checked out) → none, WITHOUT
 *    creating a customer (reads must have no side effects — customers are
 *    created lazily at checkout/portal via `getOrCreateCustomer`);
 * 4. otherwise → live `entitlements.activeEntitlements.list`, cached per
 *    customer for `CACHE_TTL_MS`, invalidated by the Stripe webhook.
 */
export function createEntitlementsService(deps: { authRepo: AuthRepository }): EntitlementsService {
  const cache = new Map<string, { set: Set<string>; exp: number }>();

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
    if (!isBillingConfigured) return new Set<string>();

    const customerId = user.stripeCustomerId;
    if (!customerId) return new Set<string>();

    const now = Date.now();
    const cached = cache.get(customerId);
    if (cached && cached.exp > now) return cached.set;

    const list = await stripe().entitlements.activeEntitlements.list({ customer: customerId });
    const set = new Set<string>(list.data.map((entitlement) => entitlement.lookup_key));
    cache.set(customerId, { set, exp: now + CACHE_TTL_MS });
    return set;
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

    invalidate(customerId) {
      cache.delete(customerId);
    },
  };
}

/**
 * Process-wide singleton. The in-memory cache only pays off (and webhook
 * invalidation only works) if every request AND the webhook share one service
 * instance — a per-request `createEntitlementsService` would give each its own
 * empty cache. The first-passed `authRepo` wins (they're all stateless wrappers
 * over the shared Prisma client). Tests call `createEntitlementsService`
 * directly for an isolated cache.
 */
let singleton: EntitlementsService | undefined;
export function getEntitlementsService(authRepo: AuthRepository): EntitlementsService {
  singleton ??= createEntitlementsService({ authRepo });
  return singleton;
}
