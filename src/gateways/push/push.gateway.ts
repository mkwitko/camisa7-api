import { fetch } from "undici";
import { logger } from "@/infra/observability/logger";

export type PushGateway = {
  send(input: { to: string; title: string; body: string }): Promise<void>;
};

export type PushGatewayConfig = {
  /** Optional Expo access token (enhanced security) — sent as `Authorization: Bearer <token>` when set. */
  accessToken?: string;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Sends push notifications through the Expo push API. Task 12's one and only
 * caller is `cancel-presence.service.ts` notifying a promoted waitlisted
 * player — a failed/slow push must never fail that request, so every path
 * here resolves (never rejects): a falsy `to` (no token registered) is a
 * silent no-op, and any network/HTTP failure is logged and swallowed, not
 * thrown.
 */
export function createPushGateway(config: PushGatewayConfig = {}): PushGateway {
  return {
    async send(input) {
      if (!input.to) return;

      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
        };
        if (config.accessToken) headers.authorization = `Bearer ${config.accessToken}`;

        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({ to: input.to, title: input.title, body: input.body }),
        });

        if (!res.ok) {
          logger.warn(
            { to: input.to, status: res.status },
            "push.gateway: Expo push API returned a non-2xx status",
          );
        }
      } catch (error) {
        logger.warn({ to: input.to, err: error }, "push.gateway: failed to send push notification");
      }
    },
  };
}
