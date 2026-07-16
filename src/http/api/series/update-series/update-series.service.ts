import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository, SeriesFieldsPatch } from "@/http/api/matches/matches.repository";
import { assertSeriesOwner } from "../series.authz";
import type { SeriesRepository, UpdateSeriesPatch } from "../series.repository";
import type { MatchSeries } from "../series.types";

export type UpdateSeriesDeps = {
  seriesRepo: SeriesRepository;
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  /** Injected clock — never `new Date()` inside the service — so tests can pin "now" against seeded occurrence datetimes. */
  now: () => Date;
};

/** Extracts the "molde" (template) subset of `UpdateSeriesPatch` that also lives on every spawned `Match` row — propagated to future occurrences. `rule`/`status`/`endDate` are series-only and never touch existing matches. */
function toTemplatePatch(patch: UpdateSeriesPatch): SeriesFieldsPatch {
  const templatePatch: SeriesFieldsPatch = {};
  if (patch.location !== undefined) templatePatch.location = patch.location;
  if (patch.priceCents !== undefined) templatePatch.priceCents = patch.priceCents;
  if (patch.slots !== undefined) templatePatch.slots = patch.slots;
  if (patch.pixKey !== undefined) templatePatch.pixKey = patch.pixKey;
  // `time: null` (clearing it, e.g. switching to `manual`) has no sensible
  // recomputed HH:mm to push onto existing occurrences' `datetime` — only a
  // non-null `time` propagates (see `matches.repository.ts`'s
  // `updateFutureNonDetached`, whose own `SeriesFieldsPatch.time` isn't
  // nullable either).
  if (patch.time !== undefined && patch.time !== null) templatePatch.time = patch.time;
  return templatePatch;
}

/**
 * Owner edits a `MatchSeries`. Always applies the patch to the series row
 * itself; when the patch touches any "molde" field (location/priceCents/
 * slots/pixKey/time — the fields also carried by every spawned `Match`),
 * additionally propagates via `matchesRepo.updateFutureNonDetached` to every
 * future (`datetime > now`), non-`detached` occurrence — spec §3.3. A `rule`
 * change deliberately does NOT touch existing occurrences: it only changes
 * what the recurrence job generates going forward (existing rows keep
 * whatever `rule` produced them until an organizer edits them directly or
 * detaches).
 */
export function createUpdateSeriesService(deps: UpdateSeriesDeps) {
  return async (
    seriesId: string,
    userId: string,
    patch: UpdateSeriesPatch,
  ): Promise<MatchSeries> => {
    const series = await deps.seriesRepo.findById(seriesId);
    const group = series ? await deps.groupsRepo.findById(series.groupId) : null;
    assertSeriesOwner(series, group, userId);

    const updated = await deps.seriesRepo.update(seriesId, patch);

    const templatePatch = toTemplatePatch(patch);
    if (Object.keys(templatePatch).length > 0) {
      await deps.matchesRepo.updateFutureNonDetached(seriesId, deps.now(), templatePatch);
    }

    return updated;
  };
}
