import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

// São Paulo-ish reference point used as the search origin.
const ORIGIN = { lat: -23.5505, lng: -46.6333 };
// ~2km away.
const NEARBY = { lat: -23.5605, lng: -46.6433 };
// ~600km away (Rio de Janeiro-ish) — outside any sane radius.
const FAR = { lat: -22.9068, lng: -43.1729 };

const register = (h: TestApp, email: string, name = "Player") =>
  h.app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "s3cret!!", name } });

async function token(h: TestApp, email: string): Promise<string> {
  return (await register(h, email)).json().accessToken as string;
}

const createGroup = async (h: TestApp, tok: string, name: string): Promise<string> => {
  const res = await h.app.inject({
    method: "POST",
    url: "/groups",
    headers: { authorization: `Bearer ${tok}` },
    payload: { name },
  });
  return res.json().id as string;
};

/** Turns a group public directly in the DB — PATCH would need the `public_groups` entitlement (off in tests). */
const makePublic = (h: TestApp, groupId: string, joinPolicy: "open" | "request" = "open") =>
  h.prisma.group.update({ where: { id: groupId }, data: { isPublic: true, joinPolicy } });

const createMatch = (h: TestApp, tok: string, groupId: string, body: Record<string, unknown>) =>
  h.app.inject({
    method: "POST",
    url: `/groups/${groupId}/matches`,
    headers: { authorization: `Bearer ${tok}` },
    payload: { datetime: "2999-01-01T20:00:00.000Z", location: "Quadra", slots: 10, ...body },
  });

const discover = (h: TestApp, tok: string, query: Record<string, string | number>) => {
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  return h.app.inject({ method: "GET", url: `/discover?${qs}`, headers: { authorization: `Bearer ${tok}` } });
};

describe("discover e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Attendance", "GroupMember", "Match", "Player", "Group", "User" CASCADE',
    );
  });

  it("requires authentication", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: `/discover?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns nearby public open matches ordered by distance, with distanceKm/confirmedCount/full", async () => {
    const owner = await token(h, "discover-owner@x.com");
    const groupId = await createGroup(h, owner, "Public FC");
    await makePublic(h, groupId, "request");

    const near = await createMatch(h, owner, groupId, {
      location: "Near",
      slots: 2,
      latitude: NEARBY.lat,
      longitude: NEARBY.lng,
    });
    const nearId = near.json().id as string;

    // A second, farther public match (same origin group works fine).
    const far = await createMatch(h, owner, groupId, {
      location: "Far-ish",
      slots: 10,
      latitude: -23.6005,
      longitude: -46.6833,
    });
    const farId = far.json().id as string;

    // Seed one confirmed attendee at the near match so confirmedCount is
    // exercised. Done directly in the DB (not via `POST /attendance`) because
    // this group's `request` join policy would reject a stranger's confirm
    // (A4) — attendance state is just fixture here, not the behavior under test.
    const player = await h.prisma.player.create({
      data: { name: "Confirmed One", slug: "confirmed-one-test" },
    });
    await h.prisma.attendance.create({
      data: { matchId: nearId, playerId: player.id, status: "confirmed" },
    });

    const res = await discover(h, owner, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 50 });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    // Nearest first.
    expect(body[0].matchId).toBe(nearId);
    expect(body[1].matchId).toBe(farId);
    expect(body[0]).toMatchObject({
      groupName: "Public FC",
      joinPolicy: "request",
      confirmedCount: 1,
      full: false,
      slots: 2,
    });
    expect(body[0].distanceKm).toBeGreaterThan(0);
    expect(body[0].distanceKm).toBeLessThan(body[1].distanceKm);
    expect(typeof body[0].latitude).toBe("number");
  });

  it("excludes matches from private groups", async () => {
    const owner = await token(h, "discover-private@x.com");
    const groupId = await createGroup(h, owner, "Private FC");
    // NOT made public.
    await createMatch(h, owner, groupId, { latitude: NEARBY.lat, longitude: NEARBY.lng });

    const res = await discover(h, owner, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 50 });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("excludes matches outside the radius, with null coords, not open, or in the past", async () => {
    const owner = await token(h, "discover-filters@x.com");
    const groupId = await createGroup(h, owner, "Filter FC");
    await makePublic(h, groupId);

    // Far away (out of radius).
    await createMatch(h, owner, groupId, { location: "Rio", latitude: FAR.lat, longitude: FAR.lng });
    // No coords.
    await createMatch(h, owner, groupId, { location: "No coords" });
    // In the past.
    await createMatch(h, owner, groupId, {
      location: "Past",
      datetime: "2000-01-01T20:00:00.000Z",
      latitude: NEARBY.lat,
      longitude: NEARBY.lng,
    });

    const res = await discover(h, owner, { lat: ORIGIN.lat, lng: ORIGIN.lng, radiusKm: 10 });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("filters by modality and maxPriceCents", async () => {
    const owner = await token(h, "discover-modality@x.com");
    const groupId = await createGroup(h, owner, "Modality FC");
    await makePublic(h, groupId);

    const futsal = await createMatch(h, owner, groupId, {
      location: "Futsal cheap",
      modality: "futsal",
      priceCents: 1000,
      latitude: NEARBY.lat,
      longitude: NEARBY.lng,
    });
    await createMatch(h, owner, groupId, {
      location: "Society pricey",
      modality: "society",
      priceCents: 9000,
      latitude: NEARBY.lat,
      longitude: NEARBY.lng,
    });

    const byModality = await discover(h, owner, {
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      modality: "futsal",
    });
    expect(byModality.json()).toHaveLength(1);
    expect(byModality.json()[0].matchId).toBe(futsal.json().id);

    const byPrice = await discover(h, owner, {
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      radiusKm: 50,
      maxPriceCents: 5000,
    });
    expect(byPrice.json()).toHaveLength(1);
    expect(byPrice.json()[0].matchId).toBe(futsal.json().id);
  });
});
