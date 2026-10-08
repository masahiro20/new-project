import { describe, expect, it } from "vitest";
import { CROCKFORD, generateLicenseKey, isLicenseKey, normalizeLicenseKey } from "@/lib/license";

describe("license keys", () => {
  it("generates SLAB-XXXX-XXXX-XXXX in Crockford Base32", () => {
    for (let i = 0; i < 200; i++) {
      const key = generateLicenseKey();
      expect(key).toMatch(/^SLAB-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(isLicenseKey(key)).toBe(true);
    }
  });

  it("never uses I, L, O or U in the random part", () => {
    const body = Array.from({ length: 500 }, () => generateLicenseKey().slice(5)).join("");
    expect(body).not.toMatch(/[ILOU]/);
  });

  it("maps random bytes onto the alphabet without bias (byte & 31)", () => {
    expect(generateLicenseKey((n) => new Uint8Array(n))).toBe("SLAB-0000-0000-0000");
    expect(generateLicenseKey((n) => Uint8Array.from({ length: n }, (_, i) => i))).toBe("SLAB-0123-4567-89AB");
    expect(generateLicenseKey((n) => new Uint8Array(n).fill(255))).toBe("SLAB-ZZZZ-ZZZZ-ZZZZ");
    expect(generateLicenseKey((n) => new Uint8Array(n).fill(32 + 18))).toBe(`SLAB-${CROCKFORD[18].repeat(4)}-${CROCKFORD[18].repeat(4)}-${CROCKFORD[18].repeat(4)}`);
  });

  it("is effectively unique", () => {
    const keys = new Set(Array.from({ length: 5000 }, () => generateLicenseKey()));
    expect(keys.size).toBe(5000);
  });

  it("normalizes user input", () => {
    expect(normalizeLicenseKey("slab-abcd-efgh-jkmn")).toBe("SLAB-ABCD-EFGH-JKMN");
    expect(normalizeLicenseKey("  ABCD EFGH JKMN ")).toBe("SLAB-ABCD-EFGH-JKMN");
    expect(normalizeLicenseKey("SLABABCDEFGHJKMN")).toBe("SLAB-ABCD-EFGH-JKMN");
    expect(normalizeLicenseKey("SLAB-O0IL-1111-2222")).toBe("SLAB-0011-1111-2222");
  });

  it("rejects things that can't be keys", () => {
    expect(normalizeLicenseKey("")).toBeNull();
    expect(normalizeLicenseKey("SLAB-ABCD-EFGH")).toBeNull();
    expect(normalizeLicenseKey("SLAB-UUUU-AAAA-BBBB")).toBeNull(); // U is not Crockford
    expect(normalizeLicenseKey("SLAB-ABCD-EFGH-JKM!")).toBeNull();
    expect(isLicenseKey("SLAB-abcd-EFGH-JKMN")).toBe(false);
  });
});
