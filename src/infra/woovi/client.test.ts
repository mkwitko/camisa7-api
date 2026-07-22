import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiKey: "test-key" as string | undefined }));
vi.mock("@/config/env", () => ({
  get env() {
    return { WOOVI_API_KEY: h.apiKey, WOOVI_BASE_URL: "https://api.woovi.test/api/v1" };
  },
}));

const { createCharge, createSubaccount, isWooviConfigured } = await import("./client");

beforeEach(() => {
  h.apiKey = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("woovi client", () => {
  it("createCharge envia value/correlationID/subaccount com Authorization e parseia brCode", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ charge: { brCode: "BR123", qrCodeImage: "http://qr", paymentLinkUrl: "http://l" } }),
    });
    const res = await createCharge({ correlationID: "c1", value: 1500, subaccount: "pix@ex.com" });
    expect(res).toEqual({ brCode: "BR123", qrCodeImage: "http://qr", paymentLinkUrl: "http://l" });
    const [url, opts] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.woovi.test/api/v1/charge");
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: "test-key" });
    expect(JSON.parse((opts as RequestInit).body as string)).toMatchObject({
      value: 1500,
      correlationID: "c1",
      subaccount: "pix@ex.com",
    });
  });

  it("createSubaccount posta name/pixKey", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sub_1", name: "G", pixKey: "pix@ex.com" }),
    });
    const res = await createSubaccount({ name: "G", pixKey: "pix@ex.com" });
    expect(res.pixKey).toBe("pix@ex.com");
  });

  it("lança quando não configurado", async () => {
    h.apiKey = undefined;
    // isWooviConfigured é avaliado no import; reimporta com knob off:
    const mod = await import("./client");
    // com a config lida por getter, a checagem em runtime deve barrar:
    await expect(mod.createCharge({ correlationID: "c", value: 1, subaccount: "x" })).rejects.toThrow(/not_configured/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
