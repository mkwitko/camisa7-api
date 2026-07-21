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
// SER (match series, Motor de Recorrência), SYS (cross-cutting), BIL
// (billing/entitlements), JRQ (join request, Geo G3), VEN (venue, Marketplace
// V1), CON (Stripe Connect, Marketplace V2), CRT (court, Marketplace V2), BKG
// (booking, Marketplace V2), GRW (growth metrics, server-to-server). Uma
// sigla só ganha entradas quando o módulo correspondente nasce.
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
    // Geo G3 (descoberta pública): setting `Group.isPublic = true` requires the
    // `public_groups` entitlement (organizer plan). `update-group.service`
    // throws this 403 when the caller lacks the feature — the real consumption
    // point of the `public_groups` gate.
    PUBLIC_REQUIRES_PLAN: defineError({
      code: "GRP-T0003",
      status: 403,
      internalMessage: "group_public_requires_plan",
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
    // `POST /groups/:id/members/:memberId/link-user` (organizer-vouched
    // linking, replacing the removed phone-only `POST /players/claim` —
    // see `link-member-user.service.ts`'s doc comment): 404 when `email`
    // doesn't resolve to any registered `User`. Its own code (not reused
    // from AUTH) since the localized copy needs to talk about "no such
    // registered user to link", not login/auth failure.
    USER_NOT_FOUND: defineError({
      code: "PLR-T0004",
      status: 404,
      internalMessage: "user_not_found_by_email",
    }),
    // Same endpoint: 400 when the target `GroupMember` isn't a GUEST
    // (`player.userId` already set) — either it's already a registered
    // member, or it was already linked to a user previously.
    MEMBER_NOT_GUEST: defineError({
      code: "PLR-T0005",
      status: 400,
      internalMessage: "member_not_guest",
    }),
    // `POST /players/me/avatar-upload-url` — object storage (R2) not
    // configured on this deploy (env vars unset). Feature off.
    STORAGE_DISABLED: defineError({
      code: "PLR-T0006",
      status: 503,
      internalMessage: "storage_disabled",
    }),
    // Same endpoint: the requested `contentType` isn't an allowed image type.
    UNSUPPORTED_MEDIA_TYPE: defineError({
      code: "PLR-T0007",
      status: 400,
      internalMessage: "unsupported_media_type",
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
    // A pelada precisa de coordenadas (lat/lng) pra aparecer no Descobrir. Ao
    // criar sem venue/booking, o organizador tem que escolher um local no mapa
    // (LocationPicker) — texto livre sozinho deixaria a partida invisível.
    COORDS_REQUIRED: defineError({
      code: "MTC-T0005",
      status: 400,
      internalMessage: "match_coords_required",
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
    // Geo G3: confirming presence at a match of a PRIVATE group now requires
    // being a member of that group (`membersRepo.findByGroupAndPlayer`) — a
    // stranger who merely holds the match id gets this 403. (The guest-via-
    // invite path is unaffected: it goes through `public-confirm`.)
    NOT_A_MEMBER: defineError({
      code: "ATT-T0004",
      status: 403,
      internalMessage: "attendance_not_a_member",
    }),
    // Geo G3: the match belongs to a PUBLIC group whose `joinPolicy` is
    // `request` — a stranger can't confirm directly; they must open a join
    // request (Fase 2) and wait for the organizer to approve. 409 (stale/
    // wrong-flow), same family as `ALREADY_IN`.
    JOIN_REQUEST_REQUIRED: defineError({
      code: "ATT-T0005",
      status: 409,
      internalMessage: "attendance_join_request_required",
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
  // Bloco B (Motor de Recorrência), Task 5: `MatchSeries` (`series.repository`/
  // `series.authz`). Ownership itself is `assertGroupOwner`'s `GRP-T0001`/
  // `GRP-T0002` (a series has no owner of its own — its parent group does);
  // this single code covers the series-specific existence check
  // `assertSeriesOwner` needs before delegating to `assertGroupOwner`.
  SER: {
    NOT_FOUND: defineError({
      code: "SER-T0001",
      status: 404,
      internalMessage: "series_not_found",
    }),
    // Task 7: `POST /series/:id/dates` (add-series-dates) only makes sense
    // for a `manual`-rule series (the one kind with no auto-generation) —
    // 400 for any other rule kind, same "request-shape the Zod body schema
    // can't express" family as `PLR.MEMBER_NOT_GUEST`/`TEAM.INVALID_ROSTER`.
    NOT_MANUAL: defineError({
      code: "SER-T0002",
      status: 400,
      internalMessage: "series_not_manual",
    }),
  },
  // Task 5 (Mensalista vs Avulso, Bloco B follow-up): `MembershipDue` HTTP
  // endpoints (`list-dues`/`mark-paid-due`/`confirm-due`). NOT_FOUND backs an
  // unknown due id on `mark-paid-due`/`confirm-due` (before either even gets
  // to authorize). CANNOT_MANAGE is one 403 covering both authz gaps that
  // have no dedicated GRP/owner-only primitive: `list-dues` (caller is
  // neither the group owner nor a member of it — same "owner-or-member" shape
  // `ATT.CANNOT_MANAGE`/`TEAM.CANNOT_VIEW`/`RES.CANNOT_VIEW`/`STAT.CANNOT_VIEW`/
  // `VOTE.CANNOT_VIEW` already close) and `mark-paid-due` (caller is neither
  // the due's own member — via `player.userId` — nor the group owner, same
  // "self-or-owner" shape `ATT.CANNOT_MANAGE` already closes for
  // `mark-paid`/`cancel-presence`). `confirm-due` is owner-only and reuses
  // `GRP-T0001`/`GRP-T0002` via `assertDueOwner` (mirrors `confirm-payment`
  // reusing those same codes via `assertMatchOwner`) — no DUE code needed
  // there.
  DUE: {
    NOT_FOUND: defineError({
      code: "DUE-T0001",
      status: 404,
      internalMessage: "due_not_found",
    }),
    CANNOT_MANAGE: defineError({
      code: "DUE-T0002",
      status: 403,
      internalMessage: "due_forbidden",
    }),
  },
  // Entitlements & billing (Stripe). `DISABLED` (503) is thrown by the
  // billing endpoints that need Stripe configured (`checkout`/`portal`/
  // `webhook`) when `STRIPE_SECRET_KEY` is unset on this deploy — same
  // config-gated 503 shape as `PLR.STORAGE_DISABLED` (R2). `GET /billing/me`
  // does NOT throw this (it degrades to "no features").
  BIL: {
    DISABLED: defineError({
      code: "BIL-T0001",
      status: 503,
      internalMessage: "billing_disabled",
    }),
  },
  // Geo G3 (Fase 2): `JoinRequest` (`children/join-requests`) — a stranger's
  // request to join one match of a PUBLIC group whose `joinPolicy` is
  // `request`. ALREADY_REQUESTED (409) is `requestJoin`'s idempotency guard
  // (the caller already has a `pending` request for this match — same
  // "already in this state" family as `ATT.ALREADY_IN`). NOT_REQUEST_POLICY
  // (409) is thrown when the match's group ISN'T public+`request` — a
  // public+`open` group is joined directly via `confirm-presence`, so opening
  // a request is the wrong flow (the mirror image of A4's
  // `ATT.JOIN_REQUEST_REQUIRED`). A PRIVATE group reuses `ATT.NOT_A_MEMBER`
  // (403), same gate `confirm-presence` already applies. NOT_FOUND (404) backs
  // `decide` when `reqId` doesn't belong to the match; NOT_PENDING (409) when
  // it exists but was already approved/rejected (stale decision).
  JRQ: {
    ALREADY_REQUESTED: defineError({
      code: "JRQ-T0001",
      status: 409,
      internalMessage: "join_request_already_requested",
    }),
    NOT_REQUEST_POLICY: defineError({
      code: "JRQ-T0002",
      status: 409,
      internalMessage: "join_request_not_request_policy",
    }),
    NOT_FOUND: defineError({
      code: "JRQ-T0003",
      status: 404,
      internalMessage: "join_request_not_found",
    }),
    NOT_PENDING: defineError({
      code: "JRQ-T0004",
      status: 409,
      internalMessage: "join_request_not_pending",
    }),
  },
  // Marketplace V1: `Venue` (quadra) CRUD (`venues/`). ROLE_REQUIRED (403) is
  // the soft-gate on `POST /venues` — creating a venue requires the caller's
  // `User.roles` to include `quadra` (a self-declared, UX-level gate, NOT a
  // security boundary — roles are intenção/feature-unlock; the real
  // authorization is ownership). NOT_FOUND (404) / NOT_OWNER (403) back
  // `assertVenueOwner` (same "unknown id vs. not yours" split as
  // `GRP.NOT_FOUND`/`GRP.NOT_OWNER`).
  VEN: {
    ROLE_REQUIRED: defineError({
      code: "VEN-T0001",
      status: 403,
      internalMessage: "venue_role_required",
    }),
    NOT_FOUND: defineError({
      code: "VEN-T0002",
      status: 404,
      internalMessage: "venue_not_found",
    }),
    NOT_OWNER: defineError({
      code: "VEN-T0003",
      status: 403,
      internalMessage: "venue_not_owner",
    }),
  },
  // Marketplace V2: Stripe Connect (`connect/`) — connected account (Express)
  // por dono de quadra, persistido só como `User.stripeAccountId`. DISABLED
  // (503) is the config-gate on every money flow (`isBillingConfigured`
  // false), same family as `BIL.DISABLED` but Connect-specific (reviewer
  // bypass does NOT apply here, per brief). ROLE_REQUIRED (403) mirrors
  // `VEN.ROLE_REQUIRED` — the soft `quadra` role gate on starting onboarding.
  // NO_ACCOUNT (409) is thrown when an action needs `stripeAccountId` and the
  // owner never started onboarding. NOT_READY (409) is thrown when the
  // account exists but `charges_enabled` resolves false live (the owner
  // hasn't finished onboarding/KYC) — this is what blocks booking on a court
  // whose owner isn't payable yet.
  CON: {
    DISABLED: defineError({
      code: "CON-T0001",
      status: 503,
      internalMessage: "connect_disabled",
    }),
    ROLE_REQUIRED: defineError({
      code: "CON-T0002",
      status: 403,
      internalMessage: "connect_role_required",
    }),
    NO_ACCOUNT: defineError({
      code: "CON-T0003",
      status: 409,
      internalMessage: "connect_no_account",
    }),
    NOT_READY: defineError({
      code: "CON-T0004",
      status: 409,
      internalMessage: "connect_charges_disabled",
    }),
  },
  // Marketplace V2: `Court` (quadra dentro de um `Venue`) CRUD + price rules
  // (`courts/`). NOT_FOUND (404) / NOT_OWNER (403) mirror
  // `VEN.NOT_FOUND`/`VEN.NOT_OWNER` (unknown id vs. not yours).
  // INVALID_PRICE_RULES (422) backs the price-rule validator when two rules'
  // day/time windows overlap (ambiguous price for a slot).
  // DEPOSIT_PERCENT_REQUIRED (422) is thrown when `bookingMode` is `deposit`
  // but no deposit percentage was supplied — the field is required only for
  // that mode.
  CRT: {
    NOT_FOUND: defineError({
      code: "CRT-T0001",
      status: 404,
      internalMessage: "court_not_found",
    }),
    NOT_OWNER: defineError({
      code: "CRT-T0002",
      status: 403,
      internalMessage: "court_not_owner",
    }),
    INVALID_PRICE_RULES: defineError({
      code: "CRT-T0003",
      status: 422,
      internalMessage: "court_price_rules_overlap",
    }),
    DEPOSIT_PERCENT_REQUIRED: defineError({
      code: "CRT-T0004",
      status: 422,
      internalMessage: "court_deposit_percent_required",
    }),
  },
  // Marketplace V2: `Booking` (reserva de um `Court`) lifecycle
  // (`bookings/`). NOT_FOUND (404) is the unknown-id guard. SLOT_UNAVAILABLE
  // (409) backs the create-booking conflict check — the fixed-grid slot
  // (`courtId`,`date`,`startMinute`) already has an active booking (mirrors
  // `ATT.ALREADY_IN`'s "already in this state" family). SLOT_NOT_BOOKABLE
  // (422) is thrown for a structurally invalid slot (outside `slotMinutes`
  // grid, in the past, etc). NOT_ALLOWED (403) is the ownership/participation
  // guard (neither the booker nor the court owner). BAD_STATE (409) backs
  // lifecycle transitions attempted from the wrong status (e.g. confirming an
  // already-cancelled booking). COURT_INACTIVE (409) is thrown when booking
  // is attempted on a court the owner deactivated.
  BKG: {
    NOT_FOUND: defineError({
      code: "BKG-T0001",
      status: 404,
      internalMessage: "booking_not_found",
    }),
    SLOT_UNAVAILABLE: defineError({
      code: "BKG-T0002",
      status: 409,
      internalMessage: "booking_slot_unavailable",
    }),
    SLOT_NOT_BOOKABLE: defineError({
      code: "BKG-T0003",
      status: 422,
      internalMessage: "booking_slot_not_bookable",
    }),
    NOT_ALLOWED: defineError({
      code: "BKG-T0004",
      status: 403,
      internalMessage: "booking_not_allowed",
    }),
    BAD_STATE: defineError({
      code: "BKG-T0005",
      status: 409,
      internalMessage: "booking_bad_state",
    }),
    COURT_INACTIVE: defineError({
      code: "BKG-T0006",
      status: 409,
      internalMessage: "booking_court_inactive",
    }),
  },
  // Growth reporting: `GET /api/growth/metrics` — server-to-server endpoint
  // consumed by the growth-os pipeline, gated by a shared-secret bearer
  // token (`GROWTH_SERVICE_TOKEN`), not the regular JWT `authHook`. DISABLED
  // (503) is the config-gate (token unset on this deploy) — same family as
  // `BIL.DISABLED`/`CON.DISABLED`. UNAUTHORIZED (401) is thrown when the
  // caller's `Authorization: Bearer <token>` header is missing or doesn't
  // match the configured token.
  GRW: {
    DISABLED: defineError({
      code: "GRW-T0001",
      status: 503,
      internalMessage: "growth_metrics_disabled",
    }),
    UNAUTHORIZED: defineError({
      code: "GRW-T0002",
      status: 401,
      internalMessage: "growth_metrics_unauthorized",
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
