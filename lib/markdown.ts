// Minimal Markdown subset produced by the generator: headings, lists, tables,
// quotes, rules and paragraphs. Shared by the on-screen view and Word export.

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
    .split("|")
    .map((c) => c.trim());

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

/** Splits **bold** runs so both renderers can style them. */
export function inlineRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((s) => (s.startsWith("**") && s.endsWith("**") ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }));
}
