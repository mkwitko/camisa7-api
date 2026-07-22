import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

/** HMAC-SHA1(base64) do corpo cru vs header `openpix-signature`. */
export function verifyWooviSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !env.WOOVI_WEBHOOK_HMAC) return false;
  const expected = createHmac("sha1", env.WOOVI_WEBHOOK_HMAC).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
