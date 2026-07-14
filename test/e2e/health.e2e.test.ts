import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

describe("health e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  });

  afterAll(async () => {
    await h.close();
  });

  it("GET /health is public and returns ok", async () => {
    const res = await h.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
