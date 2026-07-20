import type { BalancerPlayer, BalanceResult } from "./balancer";
import { targetSizes } from "./balancer";

/** Injected shuffle so draws are deterministic in tests. */
export type Shuffle = <T>(items: readonly T[]) => T[];

/** Fisher-Yates over Math.random — the production default. */
const defaultShuffle: Shuffle = (items) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as (typeof a)[number], a[i] as (typeof a)[number]];
  }
  return a;
};

/**
 * Sorteio puro — distribui os MESMOS jogadores aleatoriamente, sem equilibrar
 * por rating. Goleiros vão um por time (round-robin, menor índice primeiro) até
 * acabarem; times sem goleiro jogam sem (revezamento em campo). O restante
 * preenche round-robin respeitando `targetSizes` como teto por time, então os
 * tamanhos diferem em ≤1. `overallByTeam` é só pra exibição (soma), não guia a
 * distribuição. Mesmo shape de saída que `balanceTeams`, então o serviço e a
 * persistência não mudam.
 */
export function drawTeams(
  players: BalancerPlayer[],
  teamCount: number,
  shuffle: Shuffle = defaultShuffle,
): BalanceResult {
  if (teamCount < 1) return { teams: [], overallByTeam: [] };

  const sizes = targetSizes(players.length, teamCount);
  const bucketByPlayer = new Map<string, number>();
  const teamPlayers: string[][] = Array.from({ length: teamCount }, () => []);

  const canTake = (team: number) => teamPlayers[team]!.length < sizes[team]!;
  const place = (playerId: string, team: number) => {
    teamPlayers[team]!.push(playerId);
    bucketByPlayer.set(playerId, team);
  };

  const gks = shuffle(players.filter((p) => p.isGoalkeeper));
  const outs = shuffle(players.filter((p) => !p.isGoalkeeper));

  // 1. one goalkeeper per team, lowest index first, until they run out or a
  //    team is already full (a team's fair share could be 0 in degenerate cases).
  let team = 0;
  for (const gk of gks) {
    while (team < teamCount && !canTake(team)) team++;
    if (team >= teamCount) break;
    place(gk.playerId, team);
    team++;
  }

  // 2. outfielders round-robin into whichever team still has room, lowest index
  //    first — this resumes the size balancing so gk-less teams catch up.
  for (const out of outs) {
    let t = 0;
    while (t < teamCount && !canTake(t)) t++;
    if (t >= teamCount) t = teamPlayers.findIndex((tp, i) => tp.length < sizes[i]!); // safety
    place(out.playerId, t < 0 ? 0 : t);
  }

  const overallById = new Map(players.map((p) => [p.playerId, p.overall]));
  const teams = teamPlayers.map((playerIds, t) => ({ team: t, playerIds }));
  const overallByTeam = teamPlayers.map((playerIds) =>
    playerIds.reduce((sum, id) => sum + (overallById.get(id) ?? 0), 0),
  );

  return { teams, overallByTeam };
}
