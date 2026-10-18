// Minimal Markdown subset produced by the agent: headings, lists, tables,
// quotes, rules, paragraphs, **bold** and [links](url).

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "rule" };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    // Links contain "|"-free URLs, but escaped pipes "\|" inside cells must survive.
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());

const isDivider = (line: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
    } else if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      i++;
    } else if (/^#{1,6}\s/.test(trimmed)) {
      const level = Math.min(trimmed.match(/^#+/)![0].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: trimmed.replace(/^#+\s*/, "") });
      i++;
    } else if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!isDivider(lines[i])) rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", rows });
    } else if (/^([-*・]|\d+[.)．])\s/.test(trimmed)) {
      const ordered = /^\d/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*・]|\d+[.)．])\s/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^([-*・]|\d+[.)．])\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
    } else if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|\||>|([-*・]|\d+[.)．])\s|-{3,}$)/.test(lines[i].trim())
      ) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "paragraph", text: para.join("\n") });
    }
  }
  return blocks;
}

export type Run = { text: string; bold: boolean; href?: string };

/** Splits **bold** runs and [text](url) links so the renderer can style them. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const pattern = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) runs.push({ text: text.slice(last, start), bold: false });
    if (m[1]) runs.push({ text: m[1].slice(2, -2), bold: true });
    else runs.push({ text: m[3], bold: false, href: m[4] });
    last = start + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs.filter((r) => r.text.length > 0);
}
