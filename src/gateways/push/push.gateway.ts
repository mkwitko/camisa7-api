import { type App, applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "@/infra/observability/logger";

export type PushGateway = {
  send(input: {
    to: string;
    title: string;
    body: string;
    /**
     * Optional FCM data payload — string-valued (FCM requires it). Delivered
     * to the app alongside the notification so a tap can deep-link (e.g.
     * `{ type, matchId }` → open the match screen).
     */
    data?: Record<string, string>;
  }): Promise<void>;
};

export type PushGatewayConfig = {
  /**
   * When `true`, the gateway initializes the Firebase Admin SDK (via Application
   * Default Credentials — `GOOGLE_APPLICATION_CREDENTIALS`) and sends real FCM
   * messages. When `false` (creds not configured), every `send` is a no-op.
   */
  enabled?: boolean;
};

/**
 * Sends push notifications through Firebase Cloud Messaging (FCM HTTP v1) via
 * the `firebase-admin` SDK, which handles the OAuth2 access token from the
 * service account behind the scenes. Task 12's one and only caller is
 * `cancel-presence.service.ts` notifying a promoted waitlisted player — a
 * failed/slow push must never fail that request, so every path here resolves
 * (never rejects): a falsy `to` (no token registered) or disabled gateway is a
 * silent no-op, and any SDK/network failure is logged and swallowed, not thrown.
 *
 * The Admin app is initialized lazily on first send and reused (module-level
 * singleton) — firebase-admin throws if `initializeApp` runs twice, so we guard
 * on `getApps()`.
 */
export function createPushGateway(config: PushGatewayConfig = {}): PushGateway {
  let app: App | undefined;

  return {
    async send(input) {
      if (!input.to || !config.enabled) return;

      try {
        // Lazy init: reuse the default app if the process already created one.
        app ??= getApps()[0] ?? initializeApp({ credential: applicationDefault() });

        await getMessaging(app).send({
          token: input.to,
          notification: { title: input.title, body: input.body },
          ...(input.data ? { data: input.data } : {}),
        });
      } catch (error) {
        logger.warn({ to: input.to, err: error }, "push.gateway: failed to send FCM notification");
      }
    },
  };
}
