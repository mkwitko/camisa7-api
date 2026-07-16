import { Prisma } from "@/generated/prisma/client";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "@/http/api/matches/matches.repository";
import type { Match } from "@/http/api/matches/matches.types";
import { ERRORS } from "@/shared/errors/catalog";
import { assertSeriesOwner } from "../series.authz";
import type { SeriesRepository } from "../series.repository";

export type AddSeriesDatesDeps = {
  seriesRepo: SeriesRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
};

export type AddSeriesDatesResult = { created: Match[]; skipped: number };

/** True for a Prisma P2002 (unique constraint) — here, `Match`'s `@@unique([seriesId, datetime])`. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Owner adds explicit occurrence dates to a `manual`-rule series — the one
 * rule kind with no auto-generation (spec §3.3/§3.4), so this is its only
 * way to grow. Rejects with `ERRORS.SER.NOT_MANUAL()` (400) for any other
 * rule kind. Idempotent per date: `insertOccurrence` hits the `Match`
 * `@@unique([seriesId, datetime])` constraint (P2002) for a date already
 * added, caught and counted as `skipped` here rather than failing the whole
 * batch — so retrying a request that partially succeeded (e.g. after a
 * timeout) is safe.
 */
export function createAddSeriesDatesService(deps: AddSeriesDatesDeps) {
  return async (
    seriesId: string,
    userId: string,
    dates: string[],
  ): Promise<AddSeriesDatesResult> => {
    const series = await deps.seriesRepo.findById(seriesId);
    const group = series ? await deps.groupsRepo.findById(series.groupId) : null;
    const { series: asserted } = assertSeriesOwner(series, group, userId);

    if (asserted.rule.kind !== "manual") throw ERRORS.SER.NOT_MANUAL();

    const created: Match[] = [];
    let skipped = 0;
    for (const datetime of dates) {
      try {
        const match = await deps.matchesRepo.insertOccurrence({
          seriesId: asserted.id,
          groupId: asserted.groupId,
          datetime,
          location: asserted.location,
          priceCents: asserted.priceCents,
          slots: asserted.slots,
          pixKey: asserted.pixKey,
        });
        created.push(match);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        skipped += 1;
      }
    }

    return { created, skipped };
  };
}
