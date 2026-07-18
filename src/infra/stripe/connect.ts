import { env } from "@/config/env";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { stripe } from "@/infra/stripe/client";

/**
 * Marketplace V2 platform fee, in cents: `max(priceCents * PLATFORM_FEE_BPS /
 * 10000, PLATFORM_FEE_MIN_CENTS)`. Rounded to the nearest cent — Stripe's
 * `application_fee_amount` must be an integer. Used both to price the fee
 * shown to the payer and as `application_fee_amount` on the booking
 * PaymentIntent (computed over the amount actually charged — the deposit
 * amount in `deposit` mode, not the full price).
 */
export function platformFeeCents(priceCents: number): number {
  const bpsFee = Math.round((priceCents * env.PLATFORM_FEE_BPS) / 10000);
  return Math.max(bpsFee, env.PLATFORM_FEE_MIN_CENTS);
}

/**
 * Creates a Stripe Connect Express account for a court owner (recipient of
 * destination-charge transfers — the platform stays merchant-of-record) and
 * persists its id on `User.stripeAccountId`. Only `transfers` is strictly
 * required to receive funds; `pix_payments` is requested too since PIX is
 * our only payment method. Idempotency (re-onboarding an owner who already
 * has an account) is the caller's responsibility.
 */
export async function createConnectedAccount(
  authRepo: AuthRepository,
  user: { id: string },
): Promise<string> {
  const account = await stripe().accounts.create({
    type: "express",
    country: "BR",
    capabilities: {
      transfers: { requested: true },
      pix_payments: { requested: true },
    },
    metadata: { userId: user.id },
  });
  await authRepo.setStripeAccountId(user.id, account.id);
  return account.id;
}

/**
 * Stripe-hosted onboarding URL (Account Link) for a connected account. The
 * web app opens this directly; `refreshUrl` is where Stripe sends the owner
 * back if the link expires mid-flow, `returnUrl` on completion (status still
 * needs a live `retrieveAccountStatus` check — completion doesn't imply
 * `charges_enabled`).
 */
export async function createAccountLink(
  accountId: string,
  opts: { refreshUrl: string; returnUrl: string },
): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: accountId,
    refresh_url: opts.refreshUrl,
    return_url: opts.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Live status of a connected account — never cached/persisted beyond this
 * call (same rationale as entitlements: only the id is stored, everything
 * else lives in Stripe). `requirementsDue` defaults to `[]` when Stripe
 * omits `requirements` or `currently_due` is `null`.
 */
export async function retrieveAccountStatus(accountId: string): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}> {
  const account = await stripe().accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue: account.requirements?.currently_due ?? [],
  };
}

/** The ready-to-render PIX voucher handed to the app — no native Stripe module needed. */
export type PixVoucher = {
  qrCodeImageUrl: string;
  copyPaste: string;
  expiresAt: string;
};

/**
 * Booking PaymentIntent — a destination charge to the court owner's
 * connected account, PIX only, 30min TTL (matches the booking hold window).
 * `application_fee_amount` is computed over `amountCents` (the amount
 * actually charged — full price or deposit, per the court's `bookingMode`),
 * not the court's full price. Clamped to `amountCents` — `platformFeeCents`'s
 * `PLATFORM_FEE_MIN_CENTS` floor can otherwise exceed a small charge (e.g. a
 * low deposit), and Stripe rejects a PI whose `application_fee_amount` is
 * greater than its `amount`.
 *
 * Confirmed server-side (`confirm: true` + `payment_method_data: { type:
 * "pix" }` on create, atomic — no separate confirm call): `@stripe/
 * stripe-react-native` has no PIX support, so the app can't confirm
 * client-side. After confirm the PI sits `requires_action` with the PIX
 * voucher on `next_action.pix_display_qr_code` — mapped here into `pix` so
 * the app can render the QR/copy-paste directly. `pix` is `null` if
 * `next_action`/`pix_display_qr_code` is absent (shouldn't happen for a
 * fresh PIX confirm, but Stripe doesn't type it as guaranteed).
 *
 * Real-integration caveat: a live BR PIX confirm may require
 * `payment_method_data.billing_details` (name/email) and, for some
 * cross-border setups, a CPF/CNPJ `tax_id` — likely optional here since the
 * platform settles BRL domestically, but worth confirming against a real
 * (non-mocked) Stripe account.
 */
export async function createBookingPaymentIntent(args: {
  amountCents: number;
  destinationAccountId: string;
  bookingId: string;
  customerId: string;
}): Promise<{ id: string; clientSecret: string; pix: PixVoucher | null }> {
  const pi = await stripe().paymentIntents.create({
    amount: args.amountCents,
    currency: "brl",
    customer: args.customerId,
    payment_method_data: { type: "pix" },
    payment_method_options: { pix: { expires_after_seconds: 1800 } },
    confirm: true,
    transfer_data: { destination: args.destinationAccountId },
    application_fee_amount: Math.min(platformFeeCents(args.amountCents), args.amountCents),
    metadata: { bookingId: args.bookingId },
  });
  if (!pi.client_secret) throw new Error("Stripe PaymentIntent created without a client_secret");

  const qr = pi.next_action?.pix_display_qr_code;
  const pix =
    qr?.image_url_png && qr.data && qr.expires_at
      ? {
          qrCodeImageUrl: qr.image_url_png,
          copyPaste: qr.data,
          expiresAt: new Date(qr.expires_at * 1000).toISOString(),
        }
      : null;

  return { id: pi.id, clientSecret: pi.client_secret, pix };
}
