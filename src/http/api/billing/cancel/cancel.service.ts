import { cancelSubscription } from "@/infra/woovi/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { SubscriptionsRepository } from "../subscription.repository";

export type CancelDeps = {
  subscriptionsRepo: SubscriptionsRepository;
};

/**
 * `POST /billing/cancel` — cancels the caller's active/pending `Subscription`
 * on Woovi and marks it `canceled` in our DB. `SUB.NOT_FOUND` (404) if the
 * user's most recent `Subscription` (if any) isn't `active`/`pending` —
 * already `canceled`/`expired` (or none at all) means there's nothing to
 * cancel. Cancels on Woovi by `recurrencyId` when we have one (set once the
 * subscription's been approved), falling back to the `wooviCorrelationID`
 * otherwise (same fallback `subscribe.service.ts` uses when replacing a
 * previous subscription).
 */
export function createCancelSubscriptionService(deps: CancelDeps) {
  return async (userId: string): Promise<{ canceled: true }> => {
    const sub = await deps.subscriptionsRepo.findLatestByUser(userId);
    if (!sub || (sub.status !== "active" && sub.status !== "pending")) {
      throw ERRORS.SUB.NOT_FOUND();
    }

    await cancelSubscription(sub.recurrencyId ?? sub.wooviCorrelationID);
    await deps.subscriptionsRepo.setStatus(sub.id, "canceled");

    return { canceled: true };
  };
}
