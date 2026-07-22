import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateSlug, randomHex4 } from "@/http/api/players/player-slug";
import { startTestDb, type TestDb } from "../../../../../test/integration/helpers/db";
import { createSuggestionsRepository, type SuggestionsRepository } from "./suggestions.repository";

// São Paulo-ish origin — offsets below are chosen so the resulting distances
// land comfortably inside/outside the radii each test asserts on (roughly
// 111km per degree of latitude).
const ORIGIN = { lat: -23.55, lng: -46.63 };

describe("suggestionsRepository (integration)", () => {
  let testDb: TestDb;
  let repo: SuggestionsRepository;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createSuggestionsRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PlayerCareer", "GroupMember", "Group", "Player", "User" CASCADE',
    );
  });

  let userSeq = 0;

  /** Seeds a `User` with coords + a `Player` linked to it (`userId` set) — the shape `nearbyCandidates` joins over. */
  async function createRegisteredPlayer(
    overrides: { latOffset?: number; lngOffset?: number; name?: string; noCoords?: boolean } = {},
  ): Promise<{ userId: string; playerId: string }> {
    userSeq += 1;
    const name = overrides.name ?? `Player ${userSeq}`;
    const user = await testDb.prisma.user.create({
      data: {
        email: `p${userSeq}@test.com`,
        name,
        ...(overrides.noCoords
          ? {}
          : {
              lastCity: "São Paulo",
              lastLat: ORIGIN.lat + (overrides.latOffset ?? 0),
              lastLng: ORIGIN.lng + (overrides.lngOffset ?? 0),
            }),
      },
    });
    const player = await testDb.prisma.player.create({
      data: { userId: user.id, name, slug: generateSlug(name, randomHex4) },
    });
    return { userId: user.id, playerId: player.id };
  }

  async function createGroupWithMembers(playerIds: string[]): Promise<void> {
    const ownerId = (await createRegisteredPlayer({ name: "Owner", noCoords: true })).userId;
    const group = await testDb.prisma.group.create({
      data: { name: "Shared Group", ownerId },
    });
    for (const playerId of playerIds) {
      await testDb.prisma.groupMember.create({
        data: { groupId: group.id, playerId, role: "jogador" },
      });
    }
  }

  it("excludes the caller themselves even though they're within radius", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const stranger = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0 });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).toEqual([stranger.playerId]);
  });

  it("excludes a player who already shares a group with the caller", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const groupmate = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0 });
    const stranger = await createRegisteredPlayer({ latOffset: 0.02, lngOffset: 0 });
    await createGroupWithMembers([me.playerId, groupmate.playerId]);

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).toEqual([stranger.playerId]);
  });

  it("doesn't crash and excludes nobody by group when myPlayerId is null", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const stranger = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0 });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: null,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).toEqual([stranger.playerId]);
  });

  it("only returns candidates within radiusKm", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    // ~1.1km away — inside a 5km radius.
    const near = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0 });
    // ~55km away — outside a 5km radius.
    const far = await createRegisteredPlayer({ latOffset: 0.5, lngOffset: 0 });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 5,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).toEqual([near.playerId]);
    expect(far.playerId).toBeTruthy(); // seeded, just asserting it's excluded above
  });

  it("excludes candidates without coordinates set", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const noCoords = await createRegisteredPlayer({ noCoords: true });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 200,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).not.toContain(noCoords.playerId);
  });

  it("orders candidates nearest-first", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const far = await createRegisteredPlayer({ latOffset: 0.3, lngOffset: 0, name: "Far" });
    const mid = await createRegisteredPlayer({ latOffset: 0.15, lngOffset: 0, name: "Mid" });
    const close = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0, name: "Close" });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 20,
    });

    expect(result.map((r) => r.playerId)).toEqual([close.playerId, mid.playerId, far.playerId]);
    expect(result[0]?.distanceKm).toBeLessThan(result[1]?.distanceKm ?? Number.POSITIVE_INFINITY);
    expect(result[1]?.distanceKm).toBeLessThan(result[2]?.distanceKm ?? Number.POSITIVE_INFINITY);
  });

  it("respects take, capping the returned rows", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    for (let i = 1; i <= 5; i++) {
      await createRegisteredPlayer({ latOffset: 0.01 * i, lngOffset: 0 });
    }

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 2,
    });

    expect(result).toHaveLength(2);
  });

  it("returns null attributes/affinity for a candidate with no PlayerCareer row", async () => {
    const me = await createRegisteredPlayer({ latOffset: 0, lngOffset: 0 });
    const stranger = await createRegisteredPlayer({ latOffset: 0.01, lngOffset: 0 });

    const result = await repo.nearbyCandidates({
      meUserId: me.userId,
      myPlayerId: me.playerId,
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      take: 20,
    });

    expect(result).toEqual([
      expect.objectContaining({ playerId: stranger.playerId, attributes: null, affinity: null }),
    ]);
  });
});
