// Bytes → text for the text formats. Browser-safe; works without TextDecoder (falls back to fflate's UTF-8 decoder).
import { strFromU8 } from "fflate";

function utf16(b: Uint8Array, le: boolean, start: number): string {
  let out = "";
  const chunk: number[] = [];
  for (let i = start; i + 1 < b.length; i += 2) {
    chunk.push(le ? b[i]! | (b[i + 1]! << 8) : (b[i]! << 8) | b[i + 1]!);
    if (chunk.length >= 8192) {
      out += String.fromCharCode(...chunk);
      chunk.length = 0;
    }
  }
  return out + String.fromCharCode(...chunk);
}

/**
 * UTF-8 (BOM stripped) or UTF-16 with a BOM. Bytes that are not valid UTF-8 are tried as Shift_JIS where the
 * runtime supports it (a note says so); otherwise a clear error is thrown.
 */
export function decodeText(data: Uint8Array, file: string): { text: string; note?: string } {
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) data = data.subarray(3);
  else if (data[0] === 0xff && data[1] === 0xfe) return { text: utf16(data, true, 2) };
  else if (data[0] === 0xfe && data[1] === 0xff) return { text: utf16(data, false, 2) };
  if (typeof TextDecoder === "undefined") return { text: strFromU8(data) };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(data) };
  } catch {
    try {
      const text = new TextDecoder("shift_jis", { fatal: true }).decode(data);
      return { text, note: `${file}: not valid UTF-8; read as Shift_JIS` };
    } catch {
      throw new Error(`${file}: not valid UTF-8 text (save it as UTF-8)`);
    }
  }
}

/** Strips a leading U+FEFF from text that was already decoded. */
export const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
