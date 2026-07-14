import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { AttendanceRepository } from "../attendance.repository";
import type { Attendance } from "../attendance.types";

export type ConfirmPresenceDeps = {
  attendanceRepo: AttendanceRepository;
  playersRepo: PlayersRepository;
};

export type ConfirmPresenceInput = { matchId: string; userId: string };

/**
 * Any authenticated user confirms their OWN presence at a match — reuses
 * their existing `Player` (linked via `userId`) or creates one on first use
 * (`findOrCreateForUser`, same helper `add-member`'s `addForUser` uses). No
 * ownership check on the match/group: unlike the matches CRUD (owner-only),
 * declaring your own presence isn't a management action. The guest path (no
 * account) is Task 9's `public-confirm`, which creates a fresh guest
 * `Player` from a submitted name/phone instead and calls this same
 * `AttendanceRepository.confirm`.
 */
export function createConfirmPresenceService(deps: ConfirmPresenceDeps) {
  return async (input: ConfirmPresenceInput): Promise<Attendance> => {
    const player = await deps.playersRepo.findOrCreateForUser(input.userId);
    const { attendance } = await deps.attendanceRepo.confirm(input.matchId, player);
    return attendance;
  };
}
