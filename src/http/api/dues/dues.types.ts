export type BillingMode = "mensalista" | "avulso";
export type DueStatus = "pending" | "paid";
export type DueProvider = "manual" | "stripe";

export type MembershipDue = {
  id: string;
  groupMemberId: string;
  competencyMonth: string; // "YYYY-MM"
  amountCents: number;
  status: DueStatus;
  paidConfirmedById: string | null;
  provider: DueProvider;
  externalRef: string | null;
  createdAt: string;
};
