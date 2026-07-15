import { Prisma } from "@/generated/prisma/client";
import type { PrismaLike } from "@/infra/db/client";

export type MergeSummary = {
  guestsMerged: number;
  membershipsMerged: number;
  attendancesMerged: number;
  statsMerged: number;
  votesMerged: number;
};

const EMPTY_SUMMARY: MergeSummary = {
  guestsMerged: 0,
  membershipsMerged: 0,
  attendancesMerged: 0,
  statsMerged: 0,
  votesMerged: 0,
};

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** True if the Json value is a non-empty object — used to prefer a rated `GroupMember` row over an empty-default one when merging. */
function hasAnyRating(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value as object).length > 0;
}

/**
 * Runs `fn` inside an interactive transaction: if `db` is the base client
 * (has `$transaction`), open one; if `db` is itself already a
 * `Prisma.TransactionClient`, just run `fn` directly against it. Same
 * pattern as `attendance.repository.ts`'s `runInTransaction`.
 */
async function runInTransaction<T>(db: PrismaLike, fn: (tx: PrismaLike) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return db.$transaction((tx) => fn(tx));
  return fn(db);
}

/**
 * Moves `guestId`'s `GroupMember` rows to `canonicalId`. `@@unique([groupId,
 * playerId])` means the canonical player may already be a member of a group
 * the guest is also in — when that happens, keep exactly ONE row rather
 * than crash on the unique: prefer whichever side actually carries a rating
 * (non-empty `seedOverall` — e.g. set via `add-member`) over an
 * empty-default row (e.g. the canonical's own row, auto-created with no
 * rating input by `addForUser`), copying that rating onto the surviving row
 * before dropping the guest's.
 */
async function mergeMemberships(
  tx: PrismaLike,
  guestId: string,
  canonicalId: string,
): Promise<number> {
  const rows = await tx.groupMember.findMany({ where: { playerId: guestId } });
  let merged = 0;

  for (const row of rows) {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_playerId: { groupId: row.groupId, playerId: canonicalId } },
    });

    if (!existing) {
      await tx.groupMember.update({ where: { id: row.id }, data: { playerId: canonicalId } });
      merged += 1;
      continue;
    }

    if (!hasAnyRating(existing.seedOverall) && hasAnyRating(row.seedOverall)) {
      await tx.groupMember.update({
        where: { id: existing.id },
        data: {
          primaryPos: row.primaryPos,
          secondaryPos: row.secondaryPos,
          affinity: row.affinity as unknown as Prisma.InputJsonValue,
          seedOverall: row.seedOverall as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await tx.groupMember.delete({ where: { id: row.id } });
    merged += 1;
  }

  return merged;
}

/**
 * Moves `guestId`'s `Attendance` rows to `canonicalId`, row by row (not
 * `updateMany`) so a conflict on the partial unique
 * `attendance_active_unique` ("at most one ACTIVE row per (matchId,
 * playerId)", see that migration's header) can be caught per row: if the
 * canonical already has an active attendance for that match, the guest's
 * row is simply dropped (the canonical's own attendance already covers that
 * match) instead of crashing the merge.
 */
async function mergeAttendances(
  tx: PrismaLike,
  guestId: string,
  canonicalId: string,
): Promise<number> {
  const rows = await tx.attendance.findMany({ where: { playerId: guestId } });
  let merged = 0;

  for (const row of rows) {
    try {
      await tx.attendance.update({ where: { id: row.id }, data: { playerId: canonicalId } });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      await tx.attendance.delete({ where: { id: row.id } });
    }
    merged += 1;
  }

  return merged;
}

/**
 * Moves `guestId`'s `MatchStat` rows to `canonicalId`, row by row so a
 * conflict on `@@unique([matchId, playerId])` (guest and canonical both
 * logged a stat line for the same match — "played as both guest and self"
 * shouldn't happen but is guarded anyway) keeps the canonical's row and
 * drops the guest's duplicate rather than crashing.
 */
async function mergeMatchStats(
  tx: PrismaLike,
  guestId: string,
  canonicalId: string,
): Promise<number> {
  const rows = await tx.matchStat.findMany({ where: { playerId: guestId } });
  let merged = 0;

  for (const row of rows) {
    try {
      await tx.matchStat.update({ where: { id: row.id }, data: { playerId: canonicalId } });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      await tx.matchStat.delete({ where: { id: row.id } });
    }
    merged += 1;
  }

  return merged;
}

/**
 * Moves `guestId`'s `Vote` rows to `canonicalId` on BOTH sides of the
 * relation. `votedPlayerId` carries no unique constraint of its own (the
 * unique key is `(matchId, voterPlayerId, category)`), so that side is a
 * plain bulk `updateMany` — reassigning who a vote was cast FOR can never
 * collide. `voterPlayerId` IS part of that unique key, so it's reassigned
 * row by row: a conflict means the canonical already cast a vote in that
 * category for that match, and the guest's duplicate is dropped (keeping
 * the canonical's own vote).
 *
 * Reassigning either side can leave a `voterPlayerId === votedPlayerId`
 * self-vote artifact (the same real person voted once as their guest
 * identity and once — or was voted for — as their canonical identity, in
 * the same match/category) — `cast-vote.service.ts`'s own rule never allows
 * a self-vote, so any such row produced by the merge is deleted rather than
 * left as a state a fresh vote could never have produced.
 */
async function mergeVotes(tx: PrismaLike, guestId: string, canonicalId: string): Promise<number> {
  const votedResult = await tx.vote.updateMany({
    where: { votedPlayerId: guestId },
    data: { votedPlayerId: canonicalId },
  });

  const voterRows = await tx.vote.findMany({ where: { voterPlayerId: guestId } });
  let voterMerged = 0;
  for (const row of voterRows) {
    try {
      await tx.vote.update({ where: { id: row.id }, data: { voterPlayerId: canonicalId } });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      await tx.vote.delete({ where: { id: row.id } });
    }
    voterMerged += 1;
  }

  await tx.vote.deleteMany({ where: { voterPlayerId: canonicalId, votedPlayerId: canonicalId } });

  return votedResult.count + voterMerged;
}

/**
 * Merges one guest player's ENTIRE history into `canonicalId`: reassigns
 * every referencing row (see the four helpers above for how each table's
 * own unique constraint is resolved without crashing), then deletes the
 * guest's `PlayerCareer` (if any — a guest CAN have one, since
 * `finalize-match`'s recompute loop runs for every confirmed attendee,
 * guest or not) and finally the guest `Player` row itself. By the time
 * `player.delete` runs, every FK that pointed at `guestId` has been
 * repointed or removed, so it never hits `ON DELETE RESTRICT`.
 */
async function mergeOneGuest(
  tx: PrismaLike,
  guestId: string,
  canonicalId: string,
): Promise<Omit<MergeSummary, "guestsMerged">> {
  const membershipsMerged = await mergeMemberships(tx, guestId, canonicalId);
  const attendancesMerged = await mergeAttendances(tx, guestId, canonicalId);
  const statsMerged = await mergeMatchStats(tx, guestId, canonicalId);
  const votesMerged = await mergeVotes(tx, guestId, canonicalId);

  await tx.playerCareer.deleteMany({ where: { playerId: guestId } });
  await tx.player.delete({ where: { id: guestId } });

  return { membershipsMerged, attendancesMerged, statsMerged, votesMerged };
}

export interface MergeGuestPlayerRepository {
  /**
   * Merges `guestPlayerId`'s ENTIRE history (memberships, attendances,
   * stats, votes cast/received — see the helpers above for the
   * conflict-resolution rules per table) into `targetPlayerId`, atomically
   * (one transaction — see `runInTransaction`), then deletes the guest
   * `Player` row. Originally the machinery behind the removed phone-only
   * `POST /players/claim` (see git history); now shared by
   * `link-member-user.service.ts`'s organizer-vouched flow, which is the
   * only caller that decides WHO may trigger a merge and WHICH guest/target
   * pair is valid — this repository trusts its caller on both counts.
   *
   * Defensive no-op (zeroed summary) if `guestPlayerId === targetPlayerId`
   * — callers should never construct that pair, but it's cheap to guard.
   */
  mergeGuestIntoPlayer(guestPlayerId: string, targetPlayerId: string): Promise<MergeSummary>;
}

/** Factory `createMergeGuestPlayerRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMergeGuestPlayerRepository(db: PrismaLike): MergeGuestPlayerRepository {
  return {
    async mergeGuestIntoPlayer(guestPlayerId, targetPlayerId) {
      if (guestPlayerId === targetPlayerId) return { ...EMPTY_SUMMARY };

      return runInTransaction(db, async (tx) => {
        const merged = await mergeOneGuest(tx, guestPlayerId, targetPlayerId);
        return { guestsMerged: 1, ...merged };
      });
    },
  };
}
