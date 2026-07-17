import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";
import type { CreateMatchBody } from "./create-match.schema";

export type CreateMatchDeps = { matchesRepo: MatchesRepository; groupsRepo: GroupsRepository };

export type CreateMatchInput = CreateMatchBody & { groupId: string; userId: string };

/** Owner creates a `Match` inside their own group. Always starts `open`. */
export function createCreateMatchService(deps: CreateMatchDeps) {
  return async (input: CreateMatchInput): Promise<Match> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    return deps.matchesRepo.insert({
      groupId: input.groupId,
      datetime: input.datetime,
      location: input.location,
      priceCents: input.priceCents ?? 0,
      slots: input.slots,
      pixKey: input.pixKey ?? null,
      modality: input.modality,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      city: input.city ?? null,
      address: input.address ?? null,
    });
  };
}
