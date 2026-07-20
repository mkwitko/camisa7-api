import { describe, expect, it } from "vitest";
import { etagFor, pngCache } from "./share.cache";

describe("etagFor", () => {
  it("is stable for the same parts and differs when they change", () => {
    expect(etagFor(["a", 1])).toBe(etagFor(["a", 1]));
    expect(etagFor(["a", 1])).not.toBe(etagFor(["a", 2]));
  });
});

describe("pngCache", () => {
  it("stores and returns buffers by key", () => {
    const c = pngCache();
    const buf = Buffer.from([1, 2, 3]);
    expect(c.get("k")).toBeUndefined();
    c.set("k", buf);
    expect(c.get("k")).toEqual(buf);
  });
});
