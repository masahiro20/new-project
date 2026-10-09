import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";

// The OG / favicon images are static files written by `npm run og` (see lib/og.tsx).
// This catches a product.config.ts change that forgot to re-run it.
describe("static OG images", () => {
  it("alt text matches product.config og.title (re-run `npm run og` if this fails)", () => {
    expect(readFileSync("app/opengraph-image.alt.txt", "utf8")).toBe(config.og.title);
    expect(readFileSync("app/twitter-image.alt.txt", "utf8")).toBe(config.og.title);
  });
  it("PNG files exist", () => {
    for (const f of ["app/opengraph-image.png", "app/twitter-image.png", "app/icon.png"]) {
      expect(readFileSync(f).subarray(1, 4).toString()).toBe("PNG");
    }
  });
});
