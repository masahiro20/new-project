// License keys: SLAB-XXXX-XXXX-XXXX, 12 Crockford Base32 symbols (60 random bits).
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX = "SLAB";
const FORMAT = /^SLAB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function generateLicenseKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 is a multiple of 32, so `byte & 31` is unbiased.
  const symbols = Array.from(random(12), (b) => CROCKFORD[b & 31]).join("");
  return `${PREFIX}-${symbols.slice(0, 4)}-${symbols.slice(4, 8)}-${symbols.slice(8, 12)}`;
}

export const isLicenseKey = (key: string) => FORMAT.test(key);

/**
 * Canonicalise what a user typed: case, spaces and hyphens are ignored, the
 * SLAB prefix is optional, and Crockford look-alikes map (O→0, I/L→1).
 * Returns null if it can't be a key.
 */
export function normalizeLicenseKey(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s\-_]/g, "");
  if (s.length === 16 && s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  if (s.length !== 12) return null;
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (![...s].every((c) => CROCKFORD.includes(c))) return null;
  return `${PREFIX}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
