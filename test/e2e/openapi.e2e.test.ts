import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, type TestApp } from "./helpers/app";

/**
 * Guards the Kubb type-generation contract (Task 13, ARCHITECTURE.md §7.2):
 * app/web (later plans) generate a typed client from `GET /docs/json`, using
 * each route's `operationId` as the generated function name. If a route ever
 * loses its `operationId` (or its response schema, without which Kubb can't
 * infer a return type), the generated client silently degrades — this test
 * fails loudly instead.
 */
describe("openapi contract e2e", () => {
  let h: TestApp;

  beforeAll(async () => {
    h = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await h.close();
  });

  it("serves a valid OpenAPI 3 document at /docs/json", async () => {
    const res = await h.app.inject({ method: "GET", url: "/docs/json" });

    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths).toBeTypeOf("object");
  });

  it("declares stable operationIds for the Kubb-consumed routes", async () => {
    const res = await h.app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json();

    const operationIds = new Set<string>();
    for (const pathItem of Object.values(doc.paths) as Record<string, unknown>[]) {
      for (const operation of Object.values(pathItem) as { operationId?: string }[]) {
        if (operation && typeof operation === "object" && operation.operationId) {
          operationIds.add(operation.operationId);
        }
      }
    }

    expect([...operationIds]).toEqual(
      expect.arrayContaining([
        "registerUser",
        "createGroup",
        "createMatch",
        "confirmPresence",
        "generateTeams",
        "resolveInvite",
      ]),
    );
  });

  it("every documented operation has BOTH an operationId and a declared response schema", async () => {
    const res = await h.app.inject({ method: "GET", url: "/docs/json" });
    const doc = res.json();

    const violations: string[] = [];
    for (const [path, pathItem] of Object.entries(doc.paths) as [
      string,
      Record<string, { operationId?: string; responses?: Record<string, unknown> }>,
    ][]) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation || typeof operation !== "object" || !("responses" in operation)) continue;
        const label = `${method.toUpperCase()} ${path}`;
        if (!operation.operationId) violations.push(`${label}: missing operationId`);
        const responseCodes = Object.keys(operation.responses ?? {});
        if (responseCodes.length === 0) violations.push(`${label}: missing response schema`);
      }
    }

    expect(violations).toEqual([]);
  });
});
