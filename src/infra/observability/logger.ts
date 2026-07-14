import pino from "pino";
import { env, SERVICE_NAME } from "@/config/env";

const isProduction = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
const isTest = env.NODE_ENV === "test";

// Observability neste projeto (por ora): Pino apenas. Sem Sentry/OTel ainda —
// entra em task futura junto dos gateways (ver PROJECT.md do futebol-back).
export const logger = pino({
  name: SERVICE_NAME,
  level: isTest ? "silent" : isProduction ? "info" : "debug",
  redact: ["req.headers.authorization", "req.headers.cookie"],
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        },
      }),
});
