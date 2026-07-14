import type { GroupMemberResponse } from "./members.schema";
import type { GroupMember } from "./members.types";

/** Flattens a domain `GroupMember` (member row joined with its `Player`) into the API response shape. */
export function presentMember(member: GroupMember): GroupMemberResponse {
  return {
    id: member.id,
    groupId: member.groupId,
    role: member.role,
    primaryPos: member.primaryPos,
    secondaryPos: member.secondaryPos,
    affinity: member.affinity,
    seedOverall: member.seedOverall,
    player: {
      id: member.player.id,
      userId: member.player.userId,
      name: member.player.name,
      phone: member.player.phone,
    },
  };
}
