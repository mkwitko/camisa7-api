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
 * acabarem OU até cada time já ter um; times sem goleiro jogam sem (revezamento
 * em campo). Qualquer goleiro excedente (mais goleiros do que times) não é
 * descartado — entra no mesmo pool de preenchimento dos jogadores de linha. O
 * restante preenche round-robin respeitando `targetSizes` como teto por time,
 * então os tamanhos diferem em ≤1. `overallByTeam` é só pra exibição (soma),
 * não guia a distribuição. Mesmo shape de saída que `balanceTeams`, então o
 * serviço e a persistência não mudam.
 */
export function drawTeams(
  players: BalancerPlayer[],
  teamCount: number,
  shuffle: Shuffle = defaultShuffle,
): BalanceResult {
  if (teamCount < 1) return { teams: [], overallByTeam: [] };

  const sizes = targetSizes(players.length, teamCount);
  const teamPlayers: string[][] = Array.from({ length: teamCount }, () => []);

  const canTake = (team: number) => teamPlayers[team]!.length < sizes[team]!;
  const place = (playerId: string, team: number) => {
    teamPlayers[team]!.push(playerId);
  };

  const gks = shuffle(players.filter((p) => p.isGoalkeeper));
  const outs = shuffle(players.filter((p) => !p.isGoalkeeper));

  // 1. one goalkeeper per team, lowest index first, until they run out or a
  //    team is already full (a team's fair share could be 0 in degenerate cases).
  //    This "one gk per team" rule only applies to this first round.
  let team = 0;
  let firstRoundGkCount = 0;
  for (const gk of gks) {
    while (team < teamCount && !canTake(team)) team++;
    if (team >= teamCount) break;
    place(gk.playerId, team);
    team++;
    firstRoundGkCount++;
  }

  // Goalkeepers beyond one-per-team (gks.length > teamCount, or a team was
  // already full) are just extra players in the draw — fold them into the
  // same fill pool as the outfielders so every one of them still gets placed.
  const leftoverGks = gks.slice(firstRoundGkCount);
  const fillPool = [...leftoverGks, ...outs];

  // 2. round-robin fill into whichever team still has room, lowest index
  //    first — this resumes the size balancing so gk-less teams catch up.
  //    Always finds room: total placed so far + fillPool.length ==
  //    players.length == sum(sizes).
  for (const p of fillPool) {
    let t = 0;
    while (t < teamCount && !canTake(t)) t++;
    place(p.playerId, t);
  }

  const overallById = new Map(players.map((p) => [p.playerId, p.overall]));
  const teams = teamPlayers.map((playerIds, t) => ({ team: t, playerIds }));
  const overallByTeam = teamPlayers.map((playerIds) =>
    playerIds.reduce((sum, id) => sum + (overallById.get(id) ?? 0), 0),
  );

  return { teams, overallByTeam };
}
