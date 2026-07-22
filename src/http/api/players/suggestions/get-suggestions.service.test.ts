import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { User } from "@/http/api/auth/auth.types";
import type { PlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import type { PlayerCareer } from "@/http/api/players/children/career/career.types";
import { withAttributeDefaults } from "@/http/api/players/players.catalog";
import type { PlayersRepository } from "@/http/api/players/players.repository";
import type { Player } from "@/http/api/players/players.types";
import { createGetSuggestionsService } from "./get-suggestions.service";
import type { SuggestionCandidate, SuggestionsRepository } from "./suggestions.repository";

const aUser = (overrides: Partial<User> = {}): User => ({
  id: "me",
  email: "me@test.com",
  name: "Me",
  roles: ["jogador"],
  hasPassword: true,
  googleSub: null,
  lastCity: "São Paulo",
  lastLat: -23.5,
  lastLng: -46.6,
  stripeCustomerId: null,
  stripeAccountId: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "my-player",
  userId: "me",
  name: "Me",
  slug: "me-0001",
  phone: null,
  avatarUrl: null,
  affinity: {},
  attributes: withAttributeDefaults({}),
  skills: [],
  dominantFoot: null,
  weakFoot: null,
  skillMoves: null,
  heightCm: null,
  weightKg: null,
  birthYear: null,
  preferredTeam: null,
  nationality: null,
  ...overrides,
});

const aCareer = (playerId: string, overrides: Partial<PlayerCareer> = {}): PlayerCareer => ({
  id: `career-${playerId}`,
  playerId,
  attributes: withAttributeDefaults({}),
  affinity: {},
  level: "bronze",
  matchesPlayed: 1,
  wins: 0,
  draws: 0,
  losses: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  mvpCount: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const aCandidate = (overrides: Partial<SuggestionCandidate> = {}): SuggestionCandidate => ({
  playerId: "cand-1",
  name: "Candidate",
  avatarUrl: null,
  city: "São Paulo",
  distanceKm: 1,
  attributes: withAttributeDefaults({}),
  affinity: {},
  ...overrides,
});

function fakeAuthRepo(user: User | null): AuthRepository {
  return { findById: vi.fn().mockResolvedValue(user) } as unknown as AuthRepository;
}

function fakePlayersRepo(player: Player): PlayersRepository {
  return {
    findOrCreateForUser: vi.fn().mockResolvedValue(player),
  } as unknown as PlayersRepository;
}

function fakeCareerRepo(byPlayerId: Record<string, PlayerCareer | null>): PlayerCareerRepository {
  return {
    findByPlayer: vi
      .fn()
      .mockImplementation(async (playerId: string) => byPlayerId[playerId] ?? null),
  } as unknown as PlayerCareerRepository;
}

function fakeSuggestionsRepo(candidates: SuggestionCandidate[]): SuggestionsRepository {
  return {
    nearbyCandidates: vi.fn().mockResolvedValue(candidates),
  } as unknown as SuggestionsRepository;
}

/** Attributes tuned so `generalOverallFrom` returns roughly `overall` for the single declared position `campo_atacante` (weighted mostly by `finalizacao`/`ritmo`/`passe`). Good enough to control ordering in these tests — exact FIFA-weight math isn't the point here. */
function attrsForOverall(overall: number): Record<string, number> {
  const base = withAttributeDefaults({});
  const filled: Record<string, number> = { ...base };
  for (const key of Object.keys(filled)) filled[key] = overall;
  return filled;
}

describe("createGetSuggestionsService", () => {
  it("returns [] when the caller has no coordinates set", async () => {
    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser({ lastLat: null, lastLng: null })),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({}),
      suggestionsRepo: fakeSuggestionsRepo([aCandidate()]),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 20 });

    expect(result).toEqual([]);
  });

  it("returns [] when the caller (user row) can't be found", async () => {
    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(null),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({}),
      suggestionsRepo: fakeSuggestionsRepo([aCandidate()]),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 20 });

    expect(result).toEqual([]);
  });

  it("within the same km-bucket, ranks the candidate closest to my overall first", async () => {
    const myCareer = aCareer("my-player", {
      attributes: attrsForOverall(70),
      affinity: { campo_atacante: 100 },
    });
    const near = aCandidate({
      playerId: "near-same-overall",
      distanceKm: 2.0,
      attributes: attrsForOverall(70),
      affinity: { campo_atacante: 100 },
    });
    const far = aCandidate({
      playerId: "far-overall",
      distanceKm: 2.2, // same km-bucket (round(2.0) === round(2.2) === 2)
      attributes: attrsForOverall(20),
      affinity: { campo_atacante: 100 },
    });

    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser()),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({ "my-player": myCareer }),
      // Deliberately handed back in the "wrong" order — the service must
      // resort, not trust repo order once overall-closeness matters.
      suggestionsRepo: fakeSuggestionsRepo([far, near]),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 20 });

    expect(result.map((s) => s.playerId)).toEqual(["near-same-overall", "far-overall"]);
  });

  it("a much closer candidate (different km-bucket) still ranks first even with a less similar overall", async () => {
    const myCareer = aCareer("my-player", {
      attributes: attrsForOverall(70),
      affinity: { campo_atacante: 100 },
    });
    const veryClose = aCandidate({
      playerId: "very-close",
      distanceKm: 1,
      attributes: attrsForOverall(20), // far from my overall
      affinity: { campo_atacante: 100 },
    });
    const sameOverallButFar = aCandidate({
      playerId: "same-overall-but-far",
      distanceKm: 15, // different km-bucket
      attributes: attrsForOverall(70), // identical to my overall
      affinity: { campo_atacante: 100 },
    });

    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser()),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({ "my-player": myCareer }),
      suggestionsRepo: fakeSuggestionsRepo([sameOverallButFar, veryClose]),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 20 });

    expect(result.map((s) => s.playerId)).toEqual(["very-close", "same-overall-but-far"]);
  });

  it("a candidate with no career yet still shows up with a baseline overall/level", async () => {
    const candidateWithNoCareer = aCandidate({
      playerId: "no-career",
      attributes: null,
      affinity: null,
    });

    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser()),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({}),
      suggestionsRepo: fakeSuggestionsRepo([candidateWithNoCareer]),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 20 });

    expect(result).toEqual([
      expect.objectContaining({ playerId: "no-career", overall: 0, level: "bronze" }),
    ]);
  });

  it("respects limit, capping the returned suggestions", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      aCandidate({ playerId: `cand-${i}`, distanceKm: i + 1 }),
    );

    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser()),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({}),
      suggestionsRepo: fakeSuggestionsRepo(candidates),
    });

    const result = await service.run("me", { radiusKm: 50, limit: 3 });

    expect(result).toHaveLength(3);
  });

  it("asks the repo for take = limit * 3 candidates", async () => {
    const suggestionsRepo = fakeSuggestionsRepo([]);
    const service = createGetSuggestionsService({
      authRepo: fakeAuthRepo(aUser()),
      playersRepo: fakePlayersRepo(aPlayer()),
      careerRepo: fakeCareerRepo({}),
      suggestionsRepo,
    });

    await service.run("me", { radiusKm: 30, limit: 7 });

    expect(suggestionsRepo.nearbyCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21, radiusKm: 30, meUserId: "me", myPlayerId: "my-player" }),
    );
  });
});
