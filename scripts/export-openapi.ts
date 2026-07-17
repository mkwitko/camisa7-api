/**
 * Export the OpenAPI 3 document to a static JSON file so the frontends
 * (Camisa7 / futebol-web) can generate their typed clients via Kubb
 * without a running server. Uses dummy env — no DB connection is opened.
 *
 * Usage: pnpm tsx scripts/export-openapi.ts [outFile]
 */
import { writeFileSync } from "node:fs";
import { setDummyEnv } from "../test/helpers/dummy-env.js";

setDummyEnv();

const { buildApp } = await import("../src/app.js");
const { buildFakeGateways } = await import("../test/mocks/gateways.fake.js");

const app = await buildApp({ gateways: buildFakeGateways() });
await app.ready();

const spec = app.swagger();
const out = process.argv[2] ?? "openapi.json";
writeFileSync(out, JSON.stringify(spec, null, 2));

const paths = Object.keys((spec as { paths?: Record<string, unknown> }).paths ?? {}).length;
console.log(`wrote ${out}: ${paths} paths`);

await app.close();
