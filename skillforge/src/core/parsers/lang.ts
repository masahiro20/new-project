// Language hints from column headers, locale codes and file names. Browser-safe (no node: imports).
import type { Lang } from "../types.js";

export const otherLang = (l: Lang): Lang => (l === "ja" ? "en" : "ja");

const WORDS: Record<string, Lang> = { japanese: "ja", 日本語: "ja", 英語: "en", english: "en", jp: "ja" };

/** "ja", "ja-JP", "ja_jp", "jpn", "en", "en-US", "eng", "Japanese", "日本語" → Lang. Anything else → undefined. */
export function langOfCode(code: string | undefined): Lang | undefined {
  if (!code) return undefined;
  const c = code.trim().toLowerCase();
  if (WORDS[c]) return WORDS[c];
  if (/^(ja|jpn)([-_][a-z0-9]+)*$/.test(c)) return "ja";
  if (/^(en|eng)([-_][a-z0-9]+)*$/.test(c)) return "en";
  return undefined;
}

/**
 * Language named by a column header: plain codes/words ("ja", "English", "ja-JP", "日本語") and the
 * Unity Localization export style "Japanese(ja)", "English (en)", "English (United States)(en-US)".
 */
export function langOfHeader(header: string | undefined): Lang | undefined {
  if (!header) return undefined;
  const h = header.trim();
  const direct = langOfCode(h) ?? langOfCode(h.replace(/\s+/g, "_"));
  if (direct) return direct;
  const paren = /\(([^()]+)\)\s*$/.exec(h);
  return paren ? langOfCode(paren[1]) : undefined;
}

const splitPath = (name: string) => name.replace(/\\/g, "/").split("/").filter(Boolean);
const STEM_SPLIT = /([._\- ]+)/;

function stemAndExt(seg: string): [string, string] {
  const i = seg.lastIndexOf(".");
  return i > 0 ? [seg.slice(0, i), seg.slice(i)] : [seg, ""];
}

/** Language token in a path, file name first: ja.json, ui_en.csv, locales/ja-JP/ui.json, ST_Menu_Japanese.csv. */
export function langFromName(name: string): Lang | undefined {
  const segs = splitPath(name.split("#")[0]!);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = i === segs.length - 1 ? stemAndExt(segs[i]!)[0] : segs[i]!;
    const whole = langOfCode(seg);
    if (whole) return whole;
    const tokens = seg.split(/[._\- ]+/).reverse();
    for (const t of tokens) {
      const l = langOfCode(t);
      if (l) return l;
    }
  }
  return undefined;
}

/** Path with language tokens replaced by "*", used to pair ui_ja.csv ↔ ui_en.csv and locales/ja/ui.json ↔ locales/en/ui.json. */
export function pairKey(name: string): string {
  const segs = splitPath(name.split("#")[0]!);
  return segs
    .map((seg, i) => {
      const [stem, ext] = i === segs.length - 1 ? stemAndExt(seg) : [seg, ""];
      if (langOfCode(stem)) return "*" + ext.toLowerCase();
      return (
        stem
          .split(STEM_SPLIT)
          .map((t) => (STEM_SPLIT.test(t) ? t : langOfCode(t) ? "*" : t.toLowerCase()))
          .join("") + ext.toLowerCase()
      );
    })
    .join("/");
}
