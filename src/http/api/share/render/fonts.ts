import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// NOTE (Task 2 brief deviation): the brief assumed the TTFs sit flat at the
// package root (`saira-condensed/SairaCondensed_600SemiBold.ttf`). The
// installed 0.4.1 actually nests each weight in its own subfolder
// (`saira-condensed/600SemiBold/SairaCondensed_600SemiBold.ttf` — verified via
// `ls node_modules/@expo-google-fonts/saira-condensed/*`), so `ttf()` takes
// the full relative path including that subfolder.

/** Resolve a TTF shipped inside @expo-google-fonts/saira-condensed. */
function ttf(relativePath: string): Buffer {
  const path = require.resolve(`@expo-google-fonts/saira-condensed/${relativePath}`);
  return readFileSync(path);
}

/** Saira Condensed weights used by the carta, loaded once at import time. */
export const SAIRA_FONTS = [
  {
    name: "Saira Condensed",
    data: ttf("600SemiBold/SairaCondensed_600SemiBold.ttf"),
    weight: 600 as const,
    style: "normal" as const,
  },
  {
    name: "Saira Condensed",
    data: ttf("700Bold/SairaCondensed_700Bold.ttf"),
    weight: 700 as const,
    style: "normal" as const,
  },
];
