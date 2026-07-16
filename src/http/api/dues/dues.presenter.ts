import type { DueResponse } from "./dues.schema";
import type { MembershipDue } from "./dues.types";

/** Maps a domain `MembershipDue` to the API response shape (currently a 1:1 flattening). */
export function presentDue(due: MembershipDue): DueResponse {
  return {
    id: due.id,
    groupMemberId: due.groupMemberId,
    competencyMonth: due.competencyMonth,
    amountCents: due.amountCents,
    status: due.status,
    paidConfirmedById: due.paidConfirmedById,
    provider: due.provider,
    externalRef: due.externalRef,
    createdAt: due.createdAt,
  };
}
