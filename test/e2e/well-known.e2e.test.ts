import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

describe(".well-known association files", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it("serves the Apple app-site-association with applinks + the /j/* path", async () => {
    const res = await h.app.inject({ method: "GET", url: "/.well-known/apple-app-site-association" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const json = res.json();
    expect(json.applinks.details[0].paths).toContain("/j/*");
  });

  it("serves the Android assetlinks", async () => {
    const res = await h.app.inject({ method: "GET", url: "/.well-known/assetlinks.json" });

    expect(res.statusCode).toBe(200);
    expect(res.json()[0].target.namespace).toBe("android_app");
  });
});
