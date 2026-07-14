import { OAuth2Client } from "google-auth-library";
import { AppError } from "@/shared/errors/app-error";
import { ERRORS } from "@/shared/errors/catalog";

export type GoogleGateway = {
  verifyIdToken(idToken: string): Promise<{ googleSub: string; email: string; name: string }>;
};

export type GoogleGatewayConfig = {
  /** Accepted OAuth client ids (Google Sign-In) — web + mobile clients share one user pool. */
  clientIds: string[];
};

/**
 * Verifies a Google Sign-In ID token via `google-auth-library`'s
 * `OAuth2Client.verifyIdToken` — validates signature, issuer, expiry, and
 * `aud` against `clientIds` in one call. Any failure (bad signature, wrong
 * audience, expired, malformed, missing `sub`/`email` claim, unverified
 * email) surfaces as the same typed `AUTH-T0005`, per ERRORS.md — callers
 * never see the underlying library's error shape.
 *
 * `email_verified` must be strictly `true`: Google issues valid ID tokens
 * for accounts whose email isn't verified (e.g. some non-Gmail identities),
 * and login-google.service.ts links `email` to an existing account —
 * accepting an unverified email would let an attacker take over any account
 * whose address they merely control long enough to register with Google.
 */
export function createGoogleGateway(config: GoogleGatewayConfig): GoogleGateway {
  const client = new OAuth2Client();

  return {
    async verifyIdToken(idToken) {
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: config.clientIds });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) throw ERRORS.AUTH.INVALID_GOOGLE_TOKEN();
        if (payload.email_verified !== true) throw ERRORS.AUTH.INVALID_GOOGLE_TOKEN();

        return {
          googleSub: payload.sub,
          email: payload.email,
          name: payload.name ?? payload.email,
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw ERRORS.AUTH.INVALID_GOOGLE_TOKEN();
      }
    },
  };
}
