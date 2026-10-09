import { finishTable } from "./columns.js";
import type { Lang, Row, Table } from "../types.js";
import { InputError } from "../errors.js";

const newlines = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
};

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
};

const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");

/** Inner XML of the first <name>…</name>; inline XLIFF tags (<x/>, <g>, <ph>, <pc>) are kept as-is for tag checks. */
const inner = (block: string, name: string): string | undefined => {
  const ms = [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))];
  if (!ms.length) return undefined;
  // Native-code containers (<bpt>&lt;b&gt;</bpt>) become empty inline markers so escaped app tags don't look like real tags.
  // XLIFF 2.0 units can hold several <segment>s; their texts are joined.
  return ms.map((m) => unescapeXml(m[1]!.replace(/<(bpt|ept|ph|it)(\s[^>]*)?>[\s\S]*?<\/\1>/g, "<$1$2/>"))).join("");
};

const toLang = (code?: string): Lang | undefined => {
  if (!code) return undefined;
  const c = code.toLowerCase();
  return c.startsWith("ja") ? "ja" : c.startsWith("en") ? "en" : undefined;
};

/** Speaker from <note from="speaker">, <note category="speaker">, or a "speaker: X" note. */
function speakerFrom(block: string): string | undefined {
  const notes = [...block.matchAll(/<note(\s[^>]*)?>([\s\S]*?)<\/note>/g)];
  for (const n of notes) {
    const tag = n[1] ?? "";
    const body = unescapeXml(n[2]!).trim();
    if (/(from|category)\s*=\s*["']speaker["']/.test(tag)) return body;
    const m = /^speaker\s*[:：]\s*(.+)$/im.exec(body);
    if (m) return m[1]!.trim();
  }
  return undefined;
}

/** XLIFF 1.2 (<trans-unit>) and 2.x (<unit><segment>) */
export function parseXliff(text: string, file: string, opts: { langs?: { source?: Lang; target?: Lang } } = {}): Table {
  const v2 = /<xliff[^>]*version\s*=\s*["']2/.test(text);
  const root = /<xliff[^>]*>/.exec(text)?.[0] ?? "";
  const fileTag = /<file[^>]*>/.exec(text)?.[0] ?? "";
  const srcLang = toLang(v2 ? attr(root, "srcLang") : attr(fileTag, "source-language"));
  const trgLang = toLang(v2 ? attr(root, "trgLang") : attr(fileTag, "target-language"));
  const unitRe = v2 ? /<unit(\s[^>]*)?>([\s\S]*?)<\/unit>/g : /<trans-unit(\s[^>]*)?>([\s\S]*?)<\/trans-unit>/g;
  const rows: Row[] = [];
  let lastOffset = 0;
  let lastLine = 1;
  for (const m of text.matchAll(unitRe)) {
    lastLine += newlines(text.slice(lastOffset, m.index));
    lastOffset = m.index!;
    const open = m[0].slice(0, m[0].indexOf(">") + 1);
    const body = m[2]!;
    const id = attr(open, "id") ?? attr(open, "resname") ?? `unit${rows.length + 1}`;
    const max = Number.parseInt(attr(open, "maxwidth") ?? attr(open, "size-restriction") ?? "", 10);
    rows.push({
      file,
      line: lastLine,
      id,
      source: inner(body, "source") ?? "",
      target: inner(body, "target") ?? "",
      speaker: speakerFrom(body),
      maxLength: Number.isFinite(max) && max > 0 ? max : undefined,
    });
  }
  if (!rows.length) throw new InputError(`${file}: no ${v2 ? "<unit>" : "<trans-unit>"} elements found`);
  return finishTable(file, "xliff", rows, undefined, { source: opts.langs?.source ?? srcLang, target: opts.langs?.target ?? trgLang });
}
