import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({ env: { WOOVI_WEBHOOK_HMAC: "secret" } }));
const { verifyWooviSignature } = await import("./webhook");

const sign = (body: string) => createHmac("sha1", "secret").update(body).digest("base64");

describe("verifyWooviSignature", () => {
  it("aceita assinatura válida", () => {
    const body = '{"event":"OPENPIX:CHARGE_COMPLETED"}';
    expect(verifyWooviSignature(body, sign(body))).toBe(true);
  });
  it("rejeita assinatura inválida ou ausente", () => {
    expect(verifyWooviSignature("{}", "nope")).toBe(false);
    expect(verifyWooviSignature("{}", undefined)).toBe(false);
  });
});
