import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { inlineRuns, parseBlocks, type Block } from "./markdown";

const FONT = "游明朝";

const runs = (text: string) =>
  text.split("\n").flatMap((line, i) =>
    inlineRuns(line).map((r, j) => new TextRun({ text: r.text, bold: r.bold, font: FONT, break: i > 0 && j === 0 ? 1 : undefined })),
  );

const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;

function toDocx(block: Block): (Paragraph | Table)[] {
  switch (block.type) {
    case "heading":
      return [new Paragraph({ heading: HEADINGS[block.level], children: runs(block.text), spacing: { before: 240, after: 120 } })];
    case "paragraph":
      return [new Paragraph({ children: runs(block.text), spacing: { after: 120 } })];
    case "quote":
      return [new Paragraph({ children: runs(block.text), indent: { left: 400 }, spacing: { after: 120 } })];
    case "list":
      return block.items.map(
        (item, i) =>
          new Paragraph({
            children: [new TextRun({ text: block.ordered ? `${i + 1}. ` : "・", font: FONT }), ...runs(item)],
            indent: { left: 360, hanging: 240 },
          }),
      );
    case "rule":
      // Each document in the set starts on a new page.
      return [new Paragraph({ children: [], pageBreakBefore: true })];
    case "table": {
      const cols = Math.max(...block.rows.map((r) => r.length));
      const border = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, r) =>
              new TableRow({
                tableHeader: r === 0,
                children: Array.from({ length: cols }, (_, c) =>
                  new TableCell({
                    borders: { top: border, bottom: border, left: border, right: border },
                    children: [
                      new Paragraph({
                        alignment: r === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                        children: r === 0 ? [new TextRun({ text: row[c] ?? "", bold: true, font: FONT })] : runs(row[c] ?? ""),
                      }),
                    ],
                  }),
                ),
              }),
          ),
        }),
        new Paragraph({ children: [] }),
      ];
    }
  }
}

export async function downloadDocx(markdown: string, filename: string): Promise<void> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ children: parseBlocks(markdown).flatMap(toDocx) }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
