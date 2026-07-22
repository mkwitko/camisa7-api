import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { createSubscriptionsRepository } from "@/http/api/billing/subscription.repository";
import { createDuesRepository } from "@/http/api/dues/dues.repository";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { prisma } from "@/infra/db/client";
import { createPaymentsRepository } from "../payments.repository";
import { createHandleWooviWebhook } from "./woovi-webhook.service";

const WooviWebhookResponse = z.object({ received: z.boolean() });

/**
 * `POST /webhooks/woovi` — public (bypasses `authHook`), consumes the RAW
 * body so `verifyWooviSignature` (RSA-SHA256 over the raw bytes, OpenPix's
 * public key) can validate the `x-webhook-signature` header. Mirrors
 * `stripe-webhook.controller.ts`:
 * thin adapter, all the actual event handling lives in
 * `createHandleWooviWebhook` (`woovi-webhook.service.ts`) so it's testable
 * without an HTTP round-trip. 401 on a bad/missing signature; 200 on every
 * verified event, handled or not (Woovi shouldn't retry those).
 */
export const wooviWebhookRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/webhooks/woovi",
    {
      schema: {
        operationId: "wooviWebhook",
        tags: ["payments"],
        // The body is validated by the HMAC signature, not by zod — the raw
        // bytes must reach `verifyWooviSignature` untouched.
        body: z.any(),
        response: { 200: WooviWebhookResponse, 401: WooviWebhookResponse },
      },
      config: { public: true, rawBody: true },
    },
    async (req, reply) => {
      const signatureHeader = req.headers["x-webhook-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      const rawBody = req.rawBody;

      if (rawBody === undefined) {
        return reply.code(401).send({ received: false });
      }

      const handle = createHandleWooviWebhook({
        paymentsRepo: createPaymentsRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        duesRepo: createDuesRepository(prisma),
        subscriptionsRepo: createSubscriptionsRepository(prisma),
      });

      const result = await handle({ rawBody: rawBody.toString(), signature });
      if (!result.ok) {
        return reply.code(401).send({ received: false });
      }
      return reply.code(200).send({ received: true });
    },
  );
};
