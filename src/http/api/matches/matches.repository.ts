import type { PrismaLike } from "@/infra/db/client";
import type { Match, MatchStatus, Modality } from "./matches.types";

type MatchRow = {
  id: string;
  groupId: string;
  seriesId: string | null;
  detached: boolean;
  datetime: Date;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: string;
  modality: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  address: string | null;
  venueId: string | null;
  createdAt: Date;
};

function toDomainMatch(row: MatchRow): Match {
  return {
    id: row.id,
    groupId: row.groupId,
    seriesId: row.seriesId ?? null,
    detached: row.detached,
    datetime: row.datetime.toISOString(),
    location: row.location,
    priceCents: row.priceCents,
    slots: row.slots,
    pixKey: row.pixKey,
    status: row.status as MatchStatus,
    modality: row.modality as Modality,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    venueId: row.venueId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recomputes `date`'s time-of-day to `time` ("HH:mm"), keeping its date, in
 * UTC — used by `updateFutureNonDetached` when a series-wide edit changes the
 * series' `time` (the recurrence job always stores/reads `datetime` in UTC).
 */
function applyTimeUTC(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setUTCHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

export type InsertMatchInput = {
  groupId: string;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  pixKey?: string | null | undefined;
  /** Defaults to `campo` when omitted (e.g. series-spawned occurrences). */
  modality?: Modality | undefined;
  /** Geo (G1) — opcionais; ausente = null. */
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  city?: string | null | undefined;
  address?: string | null | undefined;
  /** Marketplace V1: quadra vinculada (ausente = null). */
  venueId?: string | null | undefined;
};

export type UpdateMatchPatch = {
  datetime?: string | undefined;
  location?: string | undefined;
  priceCents?: number | undefined;
  slots?: number | undefined;
  pixKey?: string | null | undefined;
  detached?: boolean | undefined;
};

/** Fields `updateFutureNonDetached` can push to every non-detached future occurrence of a series. */
export type SeriesFieldsPatch = {
  location?: string | undefined;
  priceCents?: number | undefined;
  slots?: number | undefined;
  pixKey?: string | null | undefined;
  time?: string | undefined;
};

export interface MatchesRepository {
  insert(input: InsertMatchInput): Promise<Match>;
  findById(id: string): Promise<Match | null>;
  listByGroup(groupId: string, opts: { includeFinished: boolean }): Promise<Match[]>;
  update(id: string, patch: UpdateMatchPatch): Promise<Match>;
  setStatus(id: string, status: MatchStatus, tx?: PrismaLike): Promise<Match>;
  /**
   * Candidates for the F1-4 finalize cron (`src/jobs/finalize-matches.job.ts`):
   * still `"finished"` (not yet `"closed"` — a `finalize-match` re-run would
   * be a no-op status transition anyway, but the cron shouldn't keep
   * re-selecting matches it already closed), with a `MatchResult` recorded,
   * whose `datetime` is strictly before `votingDeadline` (the caller passes
   * `now - 48h`, the design doc's §5.2/§6 voting window). Oldest first, so a
   * cron run that finalizes several matches in one pass does so in a stable
   * order.
   */
  findFinishedElapsedWithResult(votingDeadline: Date): Promise<Match[]>;
  /** Future (`datetime > now`) occurrences of a series, chronological — feeds the recurrence job + series endpoints. */
  listBySeriesFuture(seriesId: string, now: Date): Promise<Match[]>;
  /** Count of future (`datetime > now`) occurrences of a series, regardless of `detached`. */
  countFutureBySeries(seriesId: string, now: Date): Promise<number>;
  /** Inserts a match linked to a series — the recurrence job's next-occurrence spawn. */
  insertOccurrence(input: InsertMatchInput & { seriesId: string }): Promise<Match>;
  /**
   * Applies a series-wide edit to every future (`datetime > now`), non
   * `detached` occurrence of the series — an organizer editing a `MatchSeries`
   * this way never touches an occurrence they already detached-edited
   * individually. Simple fields (`location`/`priceCents`/`slots`/`pixKey`) go
   * through a single `updateMany`; `time` ("HH:mm") requires recomputing each
   * row's `datetime` individually (same date, new UTC time-of-day — see
   * `applyTimeUTC`). Returns the number of matches updated.
   */
  updateFutureNonDetached(seriesId: string, now: Date, patch: SeriesFieldsPatch): Promise<number>;
}

/** Factory `createMatchesRepository(db: PrismaLike)` — composes inside a tx or standalone. */
export function createMatchesRepository(db: PrismaLike): MatchesRepository {
  const repo: MatchesRepository = {
    async insert(input) {
      const row = await db.match.create({
        data: {
          groupId: input.groupId,
          datetime: new Date(input.datetime),
          location: input.location,
          priceCents: input.priceCents,
          slots: input.slots,
          pixKey: input.pixKey ?? null,
          modality: input.modality ?? "campo",
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          city: input.city ?? null,
          address: input.address ?? null,
          venueId: input.venueId ?? null,
        },
      });
      return toDomainMatch(row);
    },

    async findById(id) {
      const row = await db.match.findUnique({ where: { id } });
      return row ? toDomainMatch(row) : null;
    },

    async listByGroup(groupId, opts) {
      const rows = await db.match.findMany({
        where: {
          groupId,
          ...(opts.includeFinished ? {} : { status: { not: "finished" } }),
        },
        orderBy: { datetime: "asc" },
      });
      return rows.map(toDomainMatch);
    },

    async update(id, patch) {
      const row = await db.match.update({
        where: { id },
        data: {
          ...(patch.datetime !== undefined ? { datetime: new Date(patch.datetime) } : {}),
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
          ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
          ...(patch.pixKey !== undefined ? { pixKey: patch.pixKey } : {}),
          ...(patch.detached !== undefined ? { detached: patch.detached } : {}),
        },
      });
      return toDomainMatch(row);
    },

    async setStatus(id, status, tx) {
      const exec = tx ?? db;
      const row = await exec.match.update({ where: { id }, data: { status } });
      return toDomainMatch(row);
    },

    async findFinishedElapsedWithResult(votingDeadline) {
      const rows = await db.match.findMany({
        where: {
          status: "finished",
          datetime: { lt: votingDeadline },
          result: { isNot: null },
        },
        orderBy: { datetime: "asc" },
      });
      return rows.map(toDomainMatch);
    },

    async listBySeriesFuture(seriesId, now) {
      const rows = await db.match.findMany({
        where: { seriesId, datetime: { gt: now } },
        orderBy: { datetime: "asc" },
      });
      return rows.map(toDomainMatch);
    },

    async countFutureBySeries(seriesId, now) {
      return db.match.count({
        where: { seriesId, datetime: { gt: now } },
      });
    },

    async insertOccurrence(input) {
      const row = await db.match.create({
        data: {
          groupId: input.groupId,
          datetime: new Date(input.datetime),
          location: input.location,
          priceCents: input.priceCents,
          slots: input.slots,
          pixKey: input.pixKey ?? null,
          seriesId: input.seriesId,
        },
      });
      return toDomainMatch(row);
    },

    async updateFutureNonDetached(seriesId, now, patch) {
      const where = { seriesId, datetime: { gt: now }, detached: false };
      const simpleData = {
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
        ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
        ...(patch.pixKey !== undefined ? { pixKey: patch.pixKey } : {}),
      };
      const hasSimpleData = Object.keys(simpleData).length > 0;

      if (patch.time === undefined) {
        if (!hasSimpleData) return 0;
        const { count } = await db.match.updateMany({ where, data: simpleData });
        return count;
      }

      const rows = await db.match.findMany({ where, select: { id: true, datetime: true } });
      if (hasSimpleData) {
        await db.match.updateMany({ where, data: simpleData });
      }
      const time = patch.time;
      await Promise.all(
        rows.map((row) =>
          db.match.update({
            where: { id: row.id },
            data: { datetime: applyTimeUTC(row.datetime, time) },
          }),
        ),
      );
      return rows.length;
    },
  };
  return repo;
}
