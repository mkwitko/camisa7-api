import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { cancelSubscription, createSubscription, isWooviConfigured } from "@/infra/woovi/client";
import { ERRORS } from "@/shared/errors/catalog";
import { PLANS } from "../billing.catalog";
import type { SubscriptionsRepository } from "../subscription.repository";
import type { Subscription } from "../subscription.types";
import type { SubscribeBody, SubscribeResponse } from "./subscribe.schema";

export type SubscribeDeps = {
  authRepo: AuthRepository;
  subscriptionsRepo: SubscriptionsRepository;
};

/** Strips everything but digits — accepts any CPF formatting (`000.000.000-00`, spaces, etc). */
function normalizeTaxId(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** A previous `Subscription` still needs cancelling before a new one can be created. */
function isReplaceable(sub: Subscription): boolean {
  return sub.status === "active" || sub.status === "pending";
}

/**
 * `POST /billing/subscribe` — starts a Woovi PIX Automático subscription for
 * the chosen plan. Mirrors the Fase-1 create-then-charge-with-cleanup
 * pattern (`pay-due.service.ts`/`pay-attendance.service.ts`): a `Subscription`
 * row is inserted first (`pending`, `id === wooviCorrelationID`), then
 * `createSubscription` is called with that correlation id; if the Woovi call
 * throws, the row is marked `canceled` (there's no `deleteById` on
 * `SubscriptionsRepository` — unlike `Payment`, a `Subscription` is kept
 * around as history) and the error is rethrown.
 *
 * Guard order: config gate first (`WOO.DISABLED`, 503, before touching the
 * DB), then CPF validation (`SUB.INVALID_TAXID` — digits-only, must be 11),
 * then the caller lookup (`AUTH.UNAUTHORIZED` if the JWT's user vanished).
 * `taxId`/`phone` are persisted on the `User` unconditionally (even if a
 * previous subscription needs replacing) so they're there for next time.
 *
 * Resubscribe: if the user already has an `active`/`pending` `Subscription`,
 * it's cancelled on Woovi (`recurrencyId` if we have one, else the
 * `wooviCorrelationID` — mirrors `cancel.service.ts`) and marked `canceled`
 * before the fresh one is created — "assinatura ativa do usuário" is always
 * the most recent one (design doc).
 *
 * `recurrencyId`: `status` stays `pending` until the `PIX_AUTOMATIC_APPROVED`
 * webhook flips it `active` (that's the only place `setActive` runs). If
 * Woovi's create response already carries a `recurrencyId`, though, it's
 * worth persisting right away — an extra `setStatus(id, "pending", { recurrencyId })`
 * write keeps status untouched but avoids losing that id if the webhook
 * (which also stores it) is ever delayed or missed.
 */
export function createSubscribeService(deps: SubscribeDeps) {
  return async (userId: string, input: SubscribeBody): Promise<SubscribeResponse> => {
    if (!isWooviConfigured) throw ERRORS.WOO.DISABLED();

    const taxId = normalizeTaxId(input.taxId);
    if (taxId.length !== 11) throw ERRORS.SUB.INVALID_TAXID();

    const user = await deps.authRepo.findById(userId);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();

    await deps.authRepo.setBillingIdentity(userId, { taxId, phone: input.phone });

    const previous = await deps.subscriptionsRepo.findLatestByUser(userId);
    if (previous && isReplaceable(previous)) {
      await cancelSubscription(previous.recurrencyId ?? previous.wooviCorrelationID);
      await deps.subscriptionsRepo.setStatus(previous.id, "canceled");
    }

    const plan = PLANS[input.plan];
    const sub = await deps.subscriptionsRepo.create({ userId, plan: input.plan });

    try {
      const result = await createSubscription({
        correlationID: sub.wooviCorrelationID,
        value: plan.priceCents,
        customer: { name: user.name, taxID: taxId, email: user.email, phone: input.phone },
        dayGenerateCharge: plan.dayGenerateCharge,
      });

      if (result.recurrencyId) {
        await deps.subscriptionsRepo.setStatus(sub.id, "pending", {
          recurrencyId: result.recurrencyId,
        });
      }

      return { subscriptionId: sub.id, status: "pending", emv: result.emv };
    } catch (err) {
      await deps.subscriptionsRepo.setStatus(sub.id, "canceled");
      throw err;
    }
  };
}
