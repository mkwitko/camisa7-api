import { createSubaccount, isWooviConfigured } from "@/infra/woovi/client";
import { ERRORS } from "@/shared/errors/catalog";
import { assertGroupOwner } from "../../groups.authz";
import type { GroupsRepository } from "../../groups.repository";
import type { CreateSubaccountResponse } from "./create-subaccount.schema";

export type CreateSubaccountDeps = { groupsRepo: GroupsRepository };

export type CreateSubaccountInput = {
  groupId: string;
  userId: string;
  pixKey: string;
};

/**
 * `POST /groups/:id/woovi/subaccount` — onboarding do organizador na Woovi:
 * registra a PIX key dele como subconta do grupo. Owner-only
 * (`assertGroupOwner`), config-gated (`isWooviConfigured`, 503 quando a Woovi
 * não está configurada neste deploy).
 *
 * Idempotente: se a `pixKey` recebida já é a que o grupo tem salva
 * (`group.wooviPixKey`), não recria a subconta na Woovi nem regrava o grupo —
 * só ecoa a resposta. Isso deixa o endpoint seguro pra chamar de novo (ex.: o
 * organizador reabre a tela de onboarding) sem duplicar subcontas.
 */
export function createCreateSubaccountService(deps: CreateSubaccountDeps) {
  return async (input: CreateSubaccountInput): Promise<CreateSubaccountResponse> => {
    if (!isWooviConfigured) throw ERRORS.WOO.DISABLED();

    const group = assertGroupOwner(await deps.groupsRepo.findById(input.groupId), input.userId);

    if (group.wooviPixKey !== input.pixKey) {
      await createSubaccount({ name: group.name, pixKey: input.pixKey });
      await deps.groupsRepo.update(input.groupId, { wooviPixKey: input.pixKey });
    }

    return { pixKey: input.pixKey };
  };
}
