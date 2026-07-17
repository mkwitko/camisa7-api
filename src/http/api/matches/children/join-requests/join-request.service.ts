import type { PushGateway } from "@/gateways/push/push.gateway";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import { assertMatchOwner } from "@/http/api/matches/matches.authz";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { logger } from "@/infra/observability/logger";
import { ERRORS } from "@/shared/errors/catalog";
import type { AttendanceRepository } from "../attendance/attendance.repository";
import type { JoinRequestRepository } from "./join-request.repository";
import type { JoinRequest, PendingJoinRequest } from "./join-request.types";

export type JoinRequestDeps = {
  joinRequestRepo: JoinRequestRepository;
  playersRepo: PlayersRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  attendanceRepo: AttendanceRepository;
  authRepo: AuthRepository;
  push: PushGateway;
};

/**
 * Geo G3 (Fase 2) join-request flow — the `joinPolicy=request` counterpart to
 * `confirm-presence`'s direct join. A stranger opens a request on one match of
 * a PUBLIC group whose policy is `request`; the group owner approves (→
 * attendance + push) or rejects it.
 */
export function createJoinRequestService(deps: JoinRequestDeps) {
  /**
   * The caller opens (or re-opens) a request to join `matchId`. Resolves the
   * caller's `Player` (`findOrCreateForUser`, same helper `confirm-presence`
   * uses) and gates on the match's group:
   * - PRIVATE group → `ATT.NOT_A_MEMBER` (403): join requests only exist for
   *   public groups; a private group requires membership.
   * - PUBLIC group + `open` → `JRQ.NOT_REQUEST_POLICY` (409): this match is
   *   joined directly (`confirm-presence`), a request is the wrong flow.
   * - PUBLIC group + `request` → creates a `pending` request. Idempotent: an
   *   existing `pending`/`approved` request throws `JRQ.ALREADY_REQUESTED`
   *   (409); a previously `rejected` one is reopened in place (the full
   *   `@@unique([matchId, playerId])` forbids a second row).
   */
  async function requestJoin(matchId: string, userId: string): Promise<JoinRequest> {
    const match = await deps.matchesRepo.findById(matchId);
    if (!match) throw ERRORS.MTC.NOT_FOUND();

    const group = await deps.groupsRepo.findById(match.groupId);
    if (!group) throw ERRORS.MTC.NOT_FOUND();

    if (!group.isPublic) throw ERRORS.ATT.NOT_A_MEMBER();
    if (group.joinPolicy !== "request") throw ERRORS.JRQ.NOT_REQUEST_POLICY();

    const player = await deps.playersRepo.findOrCreateForUser(userId);

    const existing = await deps.joinRequestRepo.findByMatchAndPlayer(matchId, player.id);
    if (existing) {
      if (existing.status !== "rejected") throw ERRORS.JRQ.ALREADY_REQUESTED();
      return deps.joinRequestRepo.reopen(existing.id);
    }
    return deps.joinRequestRepo.create(matchId, player.id);
  }

  /** Owner-only: the pending inbox for `matchId` (with each requester's name). */
  async function listRequests(matchId: string, ownerUserId: string): Promise<PendingJoinRequest[]> {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, ownerUserId);

    return deps.joinRequestRepo.listPendingByMatch(matchId);
  }

  /**
   * Owner-only decision on a `pending` request. `approve` → confirms the
   * requester's presence (`attendanceRepo.confirm`, same race-safe path
   * `confirm-presence` uses), marks the request `approved`, and fires a
   * best-effort push to the requester (only if they're a registered `User`).
   * Otherwise marks it `rejected`. Both record the acting owner in
   * `decidedById`.
   */
  async function decide(
    matchId: string,
    reqId: string,
    ownerUserId: string,
    approve: boolean,
  ): Promise<JoinRequest> {
    const match = await deps.matchesRepo.findById(matchId);
    const group = match ? await deps.groupsRepo.findById(match.groupId) : null;
    assertMatchOwner(match, group, ownerUserId);

    const request = await deps.joinRequestRepo.findById(reqId);
    if (!request || request.matchId !== matchId) throw ERRORS.JRQ.NOT_FOUND();
    if (request.status !== "pending") throw ERRORS.JRQ.NOT_PENDING();

    if (!approve) {
      return deps.joinRequestRepo.setStatus(reqId, "rejected", ownerUserId);
    }

    const player = await deps.playersRepo.findById(request.playerId);
    if (!player) throw ERRORS.JRQ.NOT_FOUND();

    await deps.attendanceRepo.confirm(matchId, player);
    const decided = await deps.joinRequestRepo.setStatus(reqId, "approved", ownerUserId);

    if (player.userId) {
      await notifyApproved(deps, player.userId, matchId);
    }

    return decided;
  }

  return { requestJoin, listRequests, decide };
}

/** Best-effort: looks up the approved requester's push token and notifies them; never throws. */
async function notifyApproved(
  deps: JoinRequestDeps,
  requesterUserId: string,
  matchId: string,
): Promise<void> {
  try {
    const token = await deps.authRepo.getPushToken(requesterUserId);
    if (!token) return;
    await deps.push.send({
      to: token,
      title: "Pedido aceito!",
      body: "Você entrou na pelada.",
      // `data` alimenta o deep-link no app: tap abre a tela da pelada.
      data: { type: "join_approved", matchId },
    });
  } catch (error) {
    logger.warn(
      { userId: requesterUserId, err: error },
      "join-request: failed to notify approved requester",
    );
  }
}
