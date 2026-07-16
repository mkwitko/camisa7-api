import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  minify: false,
  // Kept external (required from node_modules at runtime, not inlined):
  // - "pg": has environment-conditional `require()`s (pg-native, pg-cloudflare)
  //   that esbuild cannot statically bundle.
  // - "@prisma/client" (+ its "@prisma/client/runtime/*" deep imports, which
  //   esbuild also treats as external once the package name is listed): the
  //   Prisma 7 client runtime; the generated client (`src/generated/prisma`,
  //   NOT listed here) still gets fully bundled into dist/server.js — only
  //   the `@prisma/client` package itself is external.
  // - "@prisma/adapter-pg": the driver adapter, thin wrapper around `pg`.
  // - "dotenv"/"dotenv/config": bundling dotenv's CJS `main.js` into an ESM
  //   bundle makes esbuild wrap it with a `require` shim that throws on
  //   `require("fs")` ("Dynamic require of \"fs\" is not supported") —
  //   externalizing avoids that. Moved to `dependencies` in package.json so
  //   `pnpm prune --prod` keeps it in the runtime image.
  external: ["pg", "@prisma/client", "@prisma/adapter-pg", "dotenv", "dotenv/config"],
});
