import Stripe from "stripe";
import { env } from "@/config/env";
import type { AuthRepository } from "@/http/api/auth/auth.repository";

/**
 * Stripe billing client. Config-gated by `STRIPE_SECRET_KEY`: when unset,
 * `isBillingConfigured` is false and billing is OFF — `/billing/*` returns 503,
 * `hasFeature` is false for everyone (except reviewers, resolved separately).
 * Same pattern as R2 (`isStorageConfigured`) and push.
 */
export const isBillingConfigured = Boolean(env.STRIPE_SECRET_KEY);

let client: Stripe | undefined;

/**
 * Lazy Stripe SDK singleton. Throws if billing isn't configured — every caller
 * must check `isBillingConfigured` first (and surface `ERRORS.BIL.DISABLED`).
 * The API version is left to the SDK's pinned default.
 */
export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("billing_not_configured");
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Returns the user's Stripe customer id, creating (and persisting) one on first
 * use. `stripeCustomerId` is the only billing state we store — everything else
 * lives in Stripe. Assumes billing is configured (callers check).
 */
export async function getOrCreateCustomer(
  authRepo: AuthRepository,
  user: { id: string; email: string; stripeCustomerId: string | null },
): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  await authRepo.setStripeCustomerId(user.id, customer.id);
  return customer.id;
}
