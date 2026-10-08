// Demo card validation. Pure and dependency-free: the card form runs it in the
// browser and the server action runs it again. Nothing here stores or logs the
// card; callers keep `last4` at most.

export type CardInput = { number: string; expiry: string; cvc: string; name: string };
export type CardField = keyof CardInput;
export type CardResult = { ok: true; last4: string } | { ok: false; errors: Partial<Record<CardField, string>> };

export const DEMO_TEST_CARD = "4242 4242 4242 4242";

const digitsOnly = (s: string) => s.replace(/[\s-]/g, "");

/** Luhn checksum over a digit string. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** "MM/YY", "MM / YY" or "MM/YYYY" → {month, year}, or null. */
export function parseExpiry(value: string): { month: number; year: number } | null {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(value);
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** A card is valid through the last day of its expiry month. */
export function expiryInFuture(value: string, now = new Date()): boolean {
  const e = parseExpiry(value);
  if (!e) return false;
  return e.year > now.getFullYear() || (e.year === now.getFullYear() && e.month >= now.getMonth() + 1);
}

export function validateCard(input: CardInput, now = new Date()): CardResult {
  const errors: Partial<Record<CardField, string>> = {};
  const number = digitsOnly(input.number ?? "");
  if (!/^\d{12,19}$/.test(number) || !luhnValid(number)) errors.number = "カード番号が正しくありません / Invalid card number";
  if (!parseExpiry(input.expiry ?? "")) errors.expiry = "有効期限は MM/YY で入力してください / Use MM/YY";
  else if (!expiryInFuture(input.expiry, now)) errors.expiry = "有効期限が切れています / Card has expired";
  if (!/^\d{3,4}$/.test((input.cvc ?? "").trim())) errors.cvc = "セキュリティコードは3〜4桁です / CVC must be 3–4 digits";
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 100) errors.name = "カード名義を入力してください / Enter the name on the card";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, last4: number.slice(-4) };
}
