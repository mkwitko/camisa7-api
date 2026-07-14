import { describe, expect, it } from "vitest";
import { type BalancerPlayer, balanceTeams } from "./balancer";

function player(overrides: Partial<BalancerPlayer> & { playerId: string }): BalancerPlayer {
  return {
    name: overrides.playerId,
    primaryPos: "meia",
    overall: 50,
    isGoalkeeper: false,
    ...overrides,
  };
}

describe("balanceTeams", () => {
  it("spreads an even number of goalkeepers evenly across teams (round-robin by overall desc)", () => {
    const players = [
      player({ playerId: "gk1", primaryPos: "goleiro", isGoalkeeper: true, overall: 90 }),
      player({ playerId: "gk2", primaryPos: "goleiro", isGoalkeeper: true, overall: 80 }),
      player({ playerId: "gk3", primaryPos: "goleiro", isGoalkeeper: true, overall: 70 }),
      player({ playerId: "gk4", primaryPos: "goleiro", isGoalkeeper: true, overall: 60 }),
    ];

    const result = balanceTeams(players, 2);

    const gkCountByTeam = result.teams.map((t) => t.playerIds.length);
    expect(gkCountByTeam).toEqual([2, 2]);
  });

  it("splits an odd number of goalkeepers within ±1 per team", () => {
    const gks = ["gk1", "gk2", "gk3", "gk4", "gk5"].map((id, i) =>
      player({ playerId: id, primaryPos: "goleiro", isGoalkeeper: true, overall: 90 - i * 5 }),
    );

    const result = balanceTeams(gks, 2);

    const counts = result.teams.map((t) => t.playerIds.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("minimizes the overall difference for a simple 4-player split (brief example: diff <= 10)", () => {
    const players = [90, 80, 70, 60].map((overall, i) => player({ playerId: `p${i}`, overall }));

    const result = balanceTeams(players, 2);

    const diff = Math.max(...result.overallByTeam) - Math.min(...result.overallByTeam);
    expect(diff).toBeLessThanOrEqual(10);
  });

  it("uses swap-optimization to beat naive greedy on an adversarial split", () => {
    // Naive greedy (sorted desc: 10,9,5,5,5; target sizes [3,2]) lands on
    // team0={10,5,5}=20 / team1={9,5}=14 -> diff 6. A single same-kind swap
    // (10<->9) reaches the size-(3,2) optimum of diff 4 — this only happens
    // if step 3 (bounded swap-optimization) actually runs.
    const players = [10, 9, 5, 5, 5].map((overall, i) => player({ playerId: `p${i}`, overall }));

    const result = balanceTeams(players, 2);

    const diff = Math.max(...result.overallByTeam) - Math.min(...result.overallByTeam);
    expect(diff).toBeLessThanOrEqual(4);
    const sizes = result.teams.map((t) => t.playerIds.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 3]);
  });

  it("keeps team sizes within ±1 for an odd headcount (11 players, 2 teams)", () => {
    const players = Array.from({ length: 11 }, (_, i) =>
      player({ playerId: `p${i}`, overall: 50 + i }),
    );

    const result = balanceTeams(players, 2);

    const sizes = result.teams.map((t) => t.playerIds.length).sort((a, b) => a - b);
    expect(sizes).toEqual([5, 6]);
  });

  it("every input player appears exactly once across the resulting teams", () => {
    const players = Array.from({ length: 9 }, (_, i) =>
      player({ playerId: `p${i}`, overall: 40 + i * 3 }),
    );

    const result = balanceTeams(players, 3);

    const allIds = result.teams.flatMap((t) => t.playerIds).sort();
    expect(allIds).toEqual(players.map((p) => p.playerId).sort());
  });

  it("is deterministic: identical input produces identical output on repeated calls", () => {
    const players = [
      player({ playerId: "gk1", primaryPos: "goleiro", isGoalkeeper: true, overall: 85 }),
      player({ playerId: "gk2", primaryPos: "goleiro", isGoalkeeper: true, overall: 65 }),
      ...[88, 77, 66, 55, 44, 33].map((overall, i) => player({ playerId: `o${i}`, overall })),
    ];

    const first = balanceTeams(players, 3);
    const second = balanceTeams([...players], 3);

    expect(second).toEqual(first);
  });

  it("breaks overall ties deterministically by playerId ascending", () => {
    const players = ["c", "a", "b", "d"].map((id) => player({ playerId: id, overall: 50 }));

    const first = balanceTeams(players, 2);
    const second = balanceTeams([...players].reverse(), 2);

    expect(second).toEqual(first);
  });

  it("does not mutate the input array", () => {
    const players = [90, 80, 70].map((overall, i) => player({ playerId: `p${i}`, overall }));
    const snapshot = JSON.parse(JSON.stringify(players));

    balanceTeams(players, 2);

    expect(players).toEqual(snapshot);
  });
});
