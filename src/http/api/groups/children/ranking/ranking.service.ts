import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MembersRepository } from "../members/members.repository";
import type { GroupRanking, RankingRepository } from "./ranking.repository";

export type RankingDeps = {
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  playersRepo: PlayersRepository;
  rankingRepo: RankingRepository;
};

const RANKING_LIMIT = 10;

/**
 * Ranking do grupo — visível pro DONO e pros MEMBROS (jogadores) do grupo.
 * Um usuário sem vínculo com o grupo leva 404 (não vaza a existência/stats de
 * uma pelada de terceiros). Top 10 por métrica.
 */
export function createRankingService(deps: RankingDeps) {
  return async (groupId: string, userId: string): Promise<GroupRanking> => {
    const group = await deps.groupsRepo.findById(groupId);
    if (!group) throw ERRORS.GRP.NOT_FOUND();

    if (group.ownerId !== userId) {
      const player = await deps.playersRepo.findOrCreateForUser(userId);
      const member = await deps.membersRepo.findByGroupAndPlayer(groupId, player.id);
      if (!member) throw ERRORS.GRP.NOT_FOUND();
    }

    return deps.rankingRepo.computeRanking(groupId, RANKING_LIMIT);
  };
}
