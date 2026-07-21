import type { ReputationRepository } from "@/http/api/matches/children/reputation/reputation.repository";
import type { ReputationCounts } from "@/http/api/matches/children/reputation/reputation.types";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { GroupsRepository } from "../../groups.repository";
import type { MembersRepository } from "../members/members.repository";

export type GroupMemberReputation = {
  playerId: string;
  name: string;
  reputation: ReputationCounts;
};

export type GroupReputationDeps = {
  groupsRepo: GroupsRepository;
  membersRepo: MembersRepository;
  playersRepo: PlayersRepository;
  reputationRepo: ReputationRepository;
};

/**
 * Reputação do grupo — visível pro DONO e pros MEMBROS (jogadores) do grupo,
 * MESMO gate do ranking (`ranking.service.ts`): um usuário sem vínculo com o
 * grupo leva 404 (não vaza a existência/stats de uma pelada de terceiros).
 * Uma entrada por membro, com a contagem de tags recebidas (all-time) por
 * dimensão via `ReputationRepository.countsByPlayer`.
 */
export function createGroupReputationService(deps: GroupReputationDeps) {
  return async (groupId: string, userId: string): Promise<GroupMemberReputation[]> => {
    const group = await deps.groupsRepo.findById(groupId);
    if (!group) throw ERRORS.GRP.NOT_FOUND();

    if (group.ownerId !== userId) {
      const player = await deps.playersRepo.findOrCreateForUser(userId);
      const member = await deps.membersRepo.findByGroupAndPlayer(groupId, player.id);
      if (!member) throw ERRORS.GRP.NOT_FOUND();
    }

    const members = await deps.membersRepo.listByGroup(groupId);
    return Promise.all(
      members.map(async (m) => ({
        playerId: m.player.id,
        name: m.player.name,
        reputation: await deps.reputationRepo.countsByPlayer(m.player.id),
      })),
    );
  };
}
