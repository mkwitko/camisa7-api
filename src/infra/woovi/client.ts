import { env } from "@/config/env";

/**
 * Woovi client (PIX in-app). Config-gated by `WOOVI_API_KEY`: when unset,
 * `isWooviConfigured` is false and billing endpoints must return 503 before
 * calling here. Same pattern as Stripe (`isBillingConfigured`) and R2
 * (`isStorageConfigured`).
 */
export const isWooviConfigured = Boolean(env.WOOVI_API_KEY);

async function wooviFetch<T>(path: string, body: unknown): Promise<T> {
  if (!env.WOOVI_API_KEY) throw new Error("woovi_not_configured");
  const res = await fetch(`${env.WOOVI_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: env.WOOVI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`woovi_http_${res.status}`);
  return (await res.json()) as T;
}

export async function createSubaccount(input: {
  name: string;
  pixKey: string;
}): Promise<{ id: string; name: string; pixKey: string }> {
  return wooviFetch<{ id: string; name: string; pixKey: string }>("/subaccount", input);
}

export async function createCharge(input: {
  correlationID: string;
  value: number;
  subaccount: string;
  comment?: string;
}): Promise<{ brCode: string; qrCodeImage: string; paymentLinkUrl: string | null }> {
  const out = await wooviFetch<{
    charge: { brCode: string; qrCodeImage: string; paymentLinkUrl?: string | null };
  }>("/charge", input);
  return {
    brCode: out.charge.brCode,
    qrCodeImage: out.charge.qrCodeImage,
    paymentLinkUrl: out.charge.paymentLinkUrl ?? null,
  };
}

/** GET status de uma cobrança por correlationID (polling opcional; webhook é a fonte). */
export async function getCharge(correlationID: string): Promise<{ status: string } | null> {
  if (!env.WOOVI_API_KEY) throw new Error("woovi_not_configured");
  const res = await fetch(`${env.WOOVI_BASE_URL}/charge/${encodeURIComponent(correlationID)}`, {
    headers: { Authorization: env.WOOVI_API_KEY },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`woovi_http_${res.status}`);
  const out = (await res.json()) as { charge?: { status?: string } };
  return out.charge?.status ? { status: out.charge.status } : null;
}
