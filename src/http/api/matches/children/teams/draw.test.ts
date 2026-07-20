import { describe, expect, it } from "vitest";
import type { BalancerPlayer } from "./balancer";
import { drawTeams, type Shuffle } from "./draw";

// deterministic "shuffle" = identity (keeps input order) so layouts are asserted exactly.
const identity: Shuffle = (items) => [...items];

function mk(id: string, overall: number, gk = false): BalancerPlayer {
  return { playerId: id, name: id, primaryPos: gk ? "goleiro" : "campo_meia", overall, isGoalkeeper: gk };
}

describe("drawTeams", () => {
  it("assigns every player exactly once", () => {
    const players = [mk("a", 50), mk("b", 60), mk("c", 70), mk("d", 80)];
    const { teams } = drawTeams(players, 2, identity);
    const all = teams.flatMap((t) => t.playerIds).sort();
    expect(all).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps team sizes within 1 of each other", () => {
    const players = [mk("a", 50), mk("b", 60), mk("c", 70), mk("d", 80), mk("e", 55)];
    const { teams } = drawTeams(players, 2, identity);
    const sizes = teams.map((t) => t.playerIds.length).sort();
    expect(sizes).toEqual([2, 3]);
  });

  it("deals goalkeepers one per team while they last", () => {
    const players = [mk("g1", 50, true), mk("g2", 50, true), mk("o1", 60), mk("o2", 60)];
    const { teams } = drawTeams(players, 2, identity);
    // each team gets exactly one gk
    for (const t of teams) {
      const gks = t.playerIds.filter((id) => id.startsWith("g"));
      expect(gks.length).toBe(1);
    }
  });

  it("leaves a team without a goalkeeper when there aren't enough", () => {
    const players = [mk("g1", 50, true), mk("o1", 60), mk("o2", 60), mk("o3", 60)];
    const { teams } = drawTeams(players, 2, identity);
    const gkCounts = teams.map((t) => t.playerIds.filter((id) => id.startsWith("g")).length).sort();
    expect(gkCounts).toEqual([0, 1]);
    // sizes still balanced
    expect(teams.map((t) => t.playerIds.length).sort()).toEqual([2, 2]);
  });

  it("computes overallByTeam as the sum of each team's players", () => {
    const players = [mk("a", 50), mk("b", 60), mk("c", 70), mk("d", 80)];
    const { teams, overallByTeam } = drawTeams(players, 2, identity);
    for (const t of teams) {
      const expected = t.playerIds.reduce((s, id) => s + (players.find((p) => p.playerId === id)?.overall ?? 0), 0);
      expect(overallByTeam[t.team]).toBe(expected);
    }
  });
});
