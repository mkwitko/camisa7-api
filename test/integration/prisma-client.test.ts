import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

describe("prisma client (integration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  it("creates a user with a uuid id", async () => {
    const u = await testDb.prisma.user.create({ data: { email: "a@b.com", name: "A" } });
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.createdAt).toBeInstanceOf(Date);
  });
});
