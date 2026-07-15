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
// ATT (attendance), INV (invite), TEAM (team), RES (match result, Fase 1),
// SYS (cross-cutting). Uma sigla só ganha entradas quando o módulo
// correspondente nasce.
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
    // Task 17 (Fase 1, F1-4): `GET /players/:playerId/career` — an unknown
    // `Player` id (never existed at all). Distinct from `MEMBER_NOT_FOUND`
    // (a group-scoped `GroupMember` lookup) since `Player` is the global
    // identity, no group involved here.
    NOT_FOUND: defineError({
      code: "PLR-T0002",
      status: 404,
      internalMessage: "player_not_found",
    }),
    // Task 18 (Fase 1, F1-6): `GET /players/:playerId/public-profile` — the
    // shareable "Strava card". Only REGISTERED players (`userId` set) get a
    // public profile; a GUEST `Player` (`userId IS NULL`, added manually or
    // via invite, no account of their own) gets this same 404 rather than
    // leaking their aggregate stats to an unauthenticated caller who merely
    // guessed/was handed the uuid. Distinct from `NOT_FOUND` (id doesn't
    // exist at all) since the localized copy needs to say "not public", not
    // "not found".
    NOT_PUBLIC: defineError({
      code: "PLR-T0003",
      status: 404,
      internalMessage: "player_profile_not_public",
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
    // Task 14 (Fase 1): `record-result` requires the match to already be
    // `finished` (via `finish-match`) — recording a score doesn't itself
    // transition match status. Same 409 "stale state transition" family as
    // `NOT_EDITABLE`, kept as its own code since the message is specific
    // ("finish the match first").
    NOT_FINISHED: defineError({
      code: "MTC-T0003",
      status: 409,
      internalMessage: "match_not_finished",
    }),
    // Task 17 (Fase 1, F1-4): `finalize-match` requires the match to already
    // be `finished` (or already `closed` — re-finalizing is a no-op status
    // transition, see that service's doc comment) before it'll recompute
    // careers. Kept as its own code rather than reusing `NOT_FINISHED`
    // (RES's "finish before recording a score") since the localized copy
    // needs to talk about finalizing specifically, not result-recording.
    NOT_FINALIZABLE: defineError({
      code: "MTC-T0004",
      status: 409,
      internalMessage: "match_not_finalizable",
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
  // Task 10: the team balancer (`children/teams`). NOT_ENOUGH_PLAYERS is the
  // one the brief names explicitly (generate-teams needs >=2 confirmed
  // attendees); INVALID_ROSTER covers update-teams' manual-override guard
  // (every confirmed player must appear exactly once — no missing, no dupes,
  // no unknown playerId). NOT_GENERATED (404) and CANNOT_VIEW (403) back
  // `get-teams` — added later once the app needed to fetch the persisted
  // split without re-running the balancer.
  TEAM: {
    NOT_ENOUGH_PLAYERS: defineError({
      code: "TEAM-T0001",
      status: 409,
      internalMessage: "team_not_enough_players",
    }),
    INVALID_ROSTER: defineError({
      code: "TEAM-T0002",
      status: 400,
      internalMessage: "team_invalid_roster",
    }),
    NOT_GENERATED: defineError({
      code: "TEAM-T0003",
      status: 404,
      internalMessage: "team_not_generated",
    }),
    // Same shape as `ATT.CANNOT_MANAGE` (one 403 for "no standing over this
    // match's <resource>") but kept as its own TEAM code rather than reused
    // cross-module, since the localized copy needs to talk about teams, not
    // attendance.
    CANNOT_VIEW: defineError({
      code: "TEAM-T0004",
      status: 403,
      internalMessage: "team_forbidden",
    }),
  },
  // Task 14 (Fase 1): `MatchResult` (`children/result`) — closes out a
  // finished match with a score. INVALID_SCORES is the one the brief names
  // explicitly (team indices in `scores` must match the match's persisted
  // `TeamAssignment`, or the simple `{0,1}` pair if none was generated, and
  // `winnerTeam` — when given explicitly — must be one of those indices or
  // `null`). NOT_FOUND (404) backs `get-result` when no result has been
  // recorded yet; CANNOT_VIEW (403) is the same "owner-or-member" authz gap
  // `TEAM.CANNOT_VIEW`/`ATT.CANNOT_MANAGE` already close, kept as its own
  // code so the localized copy talks about results specifically.
  RES: {
    INVALID_SCORES: defineError({
      code: "RES-T0001",
      status: 400,
      internalMessage: "result_invalid_scores",
    }),
    NOT_FOUND: defineError({
      code: "RES-T0002",
      status: 404,
      internalMessage: "result_not_found",
    }),
    CANNOT_VIEW: defineError({
      code: "RES-T0003",
      status: 403,
      internalMessage: "result_forbidden",
    }),
  },
  // Task 15 (Fase 1): `MatchStat` (`children/stats`) — F1-2's organizer-logged
  // per-player stats (gols/assist/clean_sheet). INELIGIBLE_PLAYER is the one
  // the brief names explicitly (every `playerId` in a `log-stats` batch must
  // be a CONFIRMED attendee of the match — an unknown player id or one who
  // never confirmed/only waitlisted/cancelled gets this same 400, no need to
  // distinguish the two at the API boundary). CANNOT_VIEW is the same
  // "owner-or-member" authz gap `RES.CANNOT_VIEW`/`ATT.CANNOT_MANAGE`/
  // `TEAM.CANNOT_VIEW` already close, kept as its own code so the localized
  // copy talks about stats specifically. `log-stats` itself reuses
  // `MTC.NOT_FINISHED` (409) for "match isn't finished yet" — same state
  // `record-result` already gates on, no need for a stats-specific dup.
  STAT: {
    INELIGIBLE_PLAYER: defineError({
      code: "STAT-T0001",
      status: 400,
      internalMessage: "stat_ineligible_player",
    }),
    CANNOT_VIEW: defineError({
      code: "STAT-T0002",
      status: 403,
      internalMessage: "stat_forbidden",
    }),
  },
  // Task 16 (Fase 1, F1-3): `Vote` (`children/votes`) — post-game recognition
  // voting (mvp/melhor_goleiro/craque/fair_play). Numbered in the order
  // `cast-vote`'s rules are checked (see `cast-vote.service.ts`):
  // NOT_PARTICIPANT (403 — caller isn't a confirmed attendee of the match)
  // first since it's an authz gap, same family as `ATT.CANNOT_MANAGE`/
  // `STAT.CANNOT_VIEW`; INVALID_CANDIDATE (400 — `votedPlayerId` isn't a
  // confirmed attendee either) and SELF_VOTE (400 — voter === voted) are
  // both request-shape validation the Zod body schema can't express (the
  // valid set of `votedPlayerId`s is per-match, not static); WINDOW_CLOSED
  // (409 — outside the 48h post-match window, or the match isn't `finished`
  // yet) is the "stale state" family `MTC.NOT_FINISHED`/`RES.INVALID_SCORES`
  // already uses this status for. CANNOT_VIEW is the same "owner-or-member"
  // authz gap `STAT.CANNOT_VIEW`/`RES.CANNOT_VIEW`/`TEAM.CANNOT_VIEW` already
  // close, kept as its own code (rather than reused cross-module) so the
  // localized copy talks about votes specifically — backs `list-vote-tally`.
  VOTE: {
    NOT_PARTICIPANT: defineError({
      code: "VOTE-T0001",
      status: 403,
      internalMessage: "vote_not_participant",
    }),
    INVALID_CANDIDATE: defineError({
      code: "VOTE-T0002",
      status: 400,
      internalMessage: "vote_invalid_candidate",
    }),
    SELF_VOTE: defineError({
      code: "VOTE-T0003",
      status: 400,
      internalMessage: "vote_self_vote",
    }),
    WINDOW_CLOSED: defineError({
      code: "VOTE-T0004",
      status: 409,
      internalMessage: "vote_window_closed",
    }),
    CANNOT_VIEW: defineError({
      code: "VOTE-T0005",
      status: 403,
      internalMessage: "vote_forbidden",
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
