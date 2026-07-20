import { createHash } from "node:crypto";

/** Weak ETag from the parts that determine the rendered image. */
export function etagFor(parts: (string | number)[]): string {
  const hash = createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
  return `W/"${hash}"`;
}

/** Tiny bounded in-memory PNG cache (LRU-ish: evicts oldest on overflow). */
export function pngCache(max = 200) {
  const map = new Map<string, Buffer>();
  return {
    get(k: string) {
      const v = map.get(k);
      if (v) {
        map.delete(k);
        map.set(k, v); // bump recency
      }
      return v;
    },
    set(k: string, v: Buffer) {
      map.set(k, v);
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
  };
}
