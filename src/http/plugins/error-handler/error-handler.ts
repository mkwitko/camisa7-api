import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import { env } from "@/config/env";
import { AppError } from "@/shared/errors/app-error";
import { ERRORS } from "@/shared/errors/catalog";
import { translateErrorMessage } from "@/shared/errors/i18n";

type ErrorEnvelope = {
  status: number;
  code: string;
  message: string;
  trace_id: string;
  internal_message?: string;
  url?: string;
  method?: string;
  details?: unknown;
  stack?: string;
};

/** Maps an error that is not already an `AppError` into one, per ERRORS.md. */
function toAppError(error: unknown): AppError {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return ERRORS.SYS.VALIDATION({ issues: error.validation });
  }
  if (isResponseSerializationError(error)) {
    return ERRORS.SYS.INTERNAL({
      reason: "response_serialization",
      method: error.method,
      url: error.url,
    });
  }
  return ERRORS.SYS.INTERNAL();
}

function buildEnvelope(args: {
  appError: AppError;
  acceptLanguage: string | undefined;
  traceId: string;
  request: FastifyRequest;
}): ErrorEnvelope {
  const { appError, acceptLanguage, traceId, request } = args;
  const envelope: ErrorEnvelope = {
    status: appError.statusCode,
    code: appError.code,
    message: translateErrorMessage(appError.code, acceptLanguage),
    trace_id: traceId,
  };

  // Envelope enxuto em produção; verboso fora dela (dev/staging/test), per ERRORS.md.
  if (env.NODE_ENV === "production") return envelope;

  return {
    ...envelope,
    internal_message: appError.message,
    url: request.url,
    method: request.method,
    ...(appError.details !== undefined ? { details: appError.details } : {}),
    ...(appError.stack !== undefined ? { stack: appError.stack } : {}),
  };
}

const _errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: unknown, request, reply) => {
    const isKnownError = error instanceof AppError;
    const appError = isKnownError ? error : toAppError(error);

    if (!isKnownError) {
      request.log.error({ err: error }, "unhandled_error");
    }

    // NOTE: sem OTel/Sentry na Fase 0 (ver PROJECT.md do futebol-back) — o
    // trace_id do envelope é o request id do Fastify. Task futura que ligar
    // observability real pode trocar essa fonte sem mudar o shape do envelope.
    const envelope = buildEnvelope({
      appError,
      acceptLanguage: request.headers["accept-language"],
      traceId: request.id,
      request,
    });

    void reply.code(appError.statusCode).send(envelope);
  });
};

export const errorHandlerPlugin = fp(_errorHandlerPlugin, {
  fastify: "5.x",
  name: "error-handler",
});
