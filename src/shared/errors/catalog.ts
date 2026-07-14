import { AppError, type AppErrorDetails } from "./app-error";

type ErrorDefinition = {
  code: string;
  status: number;
  internalMessage: string;
};

function defineError({ code, status, internalMessage }: ErrorDefinition) {
  return (details?: AppErrorDetails): AppError =>
    new AppError(code, status, internalMessage, details);
}

// Catálogo de erros — `SIGLA-TNNNN`. Sempre lance via `ERRORS.<SIGLA>.<NAME>(details?)`,
// nunca `new AppError(...)` direto (ver ERRORS.md do skill da empresa). `internalMessage`
// é técnico/estável (aparece em log e no envelope não-prod); a mensagem localizada
// pt-BR/en-US/es-ES vem de `./i18n.ts`, resolvida pelo error-handler a partir do `code`.
//
// SIGLAs reservadas para este projeto (módulos ainda por vir nas próximas tasks):
// AUTH (autenticação/autorização), GRP (group), PLR (player), MTC (match),
// ATT (attendance), INV (invite), TEAM (team), SYS (cross-cutting). Uma sigla só
// ganha entradas quando o módulo correspondente nasce — hoje só AUTH e SYS têm
// código ativo; as demais aparecerão aqui conforme as tasks 1+ as introduzem.
export const ERRORS = {
  AUTH: {
    INVALID_TOKEN: defineError({
      code: "AUTH-T0001",
      status: 401,
      internalMessage: "invalid_token",
    }),
    UNAUTHORIZED: defineError({ code: "AUTH-T0002", status: 401, internalMessage: "unauthorized" }),
  },
  SYS: {
    VALIDATION: defineError({
      code: "SYS-T0001",
      status: 400,
      internalMessage: "validation_error",
    }),
    INTERNAL: defineError({
      code: "SYS-T0002",
      status: 500,
      internalMessage: "internal_server_error",
    }),
  },
} as const;
