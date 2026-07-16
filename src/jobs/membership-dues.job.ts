import { competencyMonth } from "@/http/api/dues/competency";
import type { DuesRepository } from "@/http/api/dues/dues.repository";
import type { MembershipDue } from "@/http/api/dues/dues.types";

/** Cron body: ensure current-month due for each mensalista of any group. `now` injected. */
export async function generateMonthlyDues(
  duesRepo: DuesRepository,
  now: Date,
): Promise<MembershipDue[]> {
  const month = competencyMonth(now);
  const members = await duesRepo.listActiveMensalistaMembers(); // already excludes members with no resolvable fee
  const created: MembershipDue[] = [];
  for (const m of members) {
    const due = await duesRepo.ensureForMember(m.groupMemberId, month, m.amountCents);
    if (due) created.push(due);
  }
  return created;
}
