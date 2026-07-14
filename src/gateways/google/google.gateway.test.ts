import {
  LoginTicket,
  OAuth2Client,
  type TokenPayload,
  type VerifyIdTokenOptions,
} from "google-auth-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleGateway } from "./google.gateway";

// `OAuth2Client.verifyIdToken` is overloaded (a Promise-returning form and a
// callback form); vi.spyOn resolves overloaded methods to the last
// signature's (void) return type, so `mockResolvedValue` can't type-check
// against it. Swapping the prototype method for an explicitly-typed vi.fn
// (restored in afterEach) sidesteps that TS limitation without an `as` cast.
const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

describe("createGoogleGateway", () => {
  afterEach(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
  });

  it("rejects a malformed idToken with AUTH-T0005 (no real network call needed)", async () => {
    const google = createGoogleGateway({ clientIds: ["test-client-id"] });

    await expect(google.verifyIdToken("not-a-real-jwt")).rejects.toMatchObject({
      code: "AUTH-T0005",
    });
  });

  it("rejects an empty idToken with AUTH-T0005", async () => {
    const google = createGoogleGateway({ clientIds: ["test-client-id"] });

    await expect(google.verifyIdToken("")).rejects.toMatchObject({ code: "AUTH-T0005" });
  });

  it("rejects a token whose email is not verified with AUTH-T0005 (account-takeover guard)", async () => {
    const payload: TokenPayload = {
      iss: "https://accounts.google.com",
      sub: "google-sub-123",
      aud: "test-client-id",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: "victim@example.com",
      email_verified: false,
      name: "Victim",
    };
    const verifyIdToken: (options: VerifyIdTokenOptions) => Promise<LoginTicket> = vi.fn(
      async () => new LoginTicket(undefined, payload),
    );
    OAuth2Client.prototype.verifyIdToken = verifyIdToken;

    const google = createGoogleGateway({ clientIds: ["test-client-id"] });

    await expect(google.verifyIdToken("some-valid-looking-jwt")).rejects.toMatchObject({
      code: "AUTH-T0005",
    });
  });
});
