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
// ganha entradas quando o módulo correspondente nasce — hoje AUTH, GRP, PLR, MTC
// e SYS têm código ativo; as demais aparecerão aqui conforme as tasks 7+ as
// introduzem.
export const ERRORS = {
  AUTH: {
    INVALID_TOKEN: defineError({
      code: "AUTH-T0001",
      status: 401,
      internalMessage: "invalid_token",
    }),
    EMAIL_TAKEN: defineError({
      code: "AUTH-T0002",
      status: 409,
      internalMessage: "email_taken",
    }),
    INVALID_CREDENTIALS: defineError({
      code: "AUTH-T0003",
      status: 401,
      internalMessage: "invalid_credentials",
    }),
    // Renumbered from AUTH-T0002 (Task 0) to make room for EMAIL_TAKEN at that
    // code, per Task 2's brief (exact e2e assertion on the duplicate-email
    // 409). Nothing depended on the old number — reused the same error type.
    UNAUTHORIZED: defineError({ code: "AUTH-T0004", status: 401, internalMessage: "unauthorized" }),
    INVALID_GOOGLE_TOKEN: defineError({
      code: "AUTH-T0005",
      status: 401,
      internalMessage: "invalid_google_token",
    }),
  },
  GRP: {
    NOT_FOUND: defineError({
      code: "GRP-T0001",
      status: 404,
      internalMessage: "group_not_found",
    }),
    NOT_OWNER: defineError({
      code: "GRP-T0002",
      status: 403,
      internalMessage: "group_not_owner",
    }),
  },
  PLR: {
    MEMBER_NOT_FOUND: defineError({
      code: "PLR-T0001",
      status: 404,
      internalMessage: "member_not_found",
    }),
  },
  MTC: {
    NOT_FOUND: defineError({
      code: "MTC-T0001",
      status: 404,
      internalMessage: "match_not_found",
    }),
    NOT_EDITABLE: defineError({
      code: "MTC-T0002",
      status: 409,
      internalMessage: "match_not_editable",
    }),
  },
  ATT: {
    // T0001 first (not T0002) because it's the one the brief names explicitly
    // (the race-safety invariant this task exists for: at most one active
    // row per match+player). NOT_FOUND follows at T0002, same numbering
    // pattern as GRP/MTC (existence check gets the lower-priority slot once
    // there's a second code).
    ALREADY_IN: defineError({
      code: "ATT-T0001",
      status: 409,
      internalMessage: "attendance_already_in",
    }),
    NOT_FOUND: defineError({
      code: "ATT-T0002",
      status: 404,
      internalMessage: "attendance_not_found",
    }),
    // Single 403 for the attendance module, covering both authz gaps closed
    // after code review: `cancel-presence` (caller is neither the target
    // attendance's own player nor the group owner) and `list-attendance`
    // (caller is neither the group owner nor a member of the match's group).
    // One consistent code rather than a pair, since both are "you have no
    // standing over this match's attendance" — the internal/log message and
    // localized copy are phrased generically enough to cover both.
    CANNOT_MANAGE: defineError({
      code: "ATT-T0003",
      status: 403,
      internalMessage: "attendance_forbidden",
    }),
  },
  // Task 9: invite tokens (`InviteToken`). One code so far — both public
  // routes (`GET /invite/:token`, `POST /invite/confirm`) throw the same
  // 404 for an unknown/invalid token, no existence-enumeration concern here
  // since a guest never "owns" a token to compare against.
  INV: {
    INVALID_TOKEN: defineError({
      code: "INV-T0001",
      status: 404,
      internalMessage: "invite_token_invalid",
    }),
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
