// Builds tiny .xlsx workbooks in memory for tests (and samples/formats/book.xlsx via scripts/make-format-samples.ts).
import { strToU8, zipSync } from "fflate";

/** A cell: plain text goes to sharedStrings; {inline} → t="inlineStr"; {rich} → shared string with <r> runs and furigana; number → numeric. */
export type Cell = string | number | { inline: string } | { rich: string[]; ruby?: string } | null;

export interface SheetSpec {
  name: string;
  /** Rows keyed by spreadsheet row number (1-based); each row maps column letter → cell, or is an array from column A. */
  rows: Record<number, Record<string, Cell> | Cell[]>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

export function makeXlsx(sheets: SheetSpec[]): Uint8Array {
  const shared: string[] = [];
  const sheetXml = sheets.map((sh) => {
    const rows = Object.entries(sh.rows)
      .map(([rn, cells]) => {
        const entries: [string, Cell][] = Array.isArray(cells) ? cells.map((c, i) => [colName(i), c]) : Object.entries(cells);
        const cs = entries
          .filter(([, c]) => c !== null && c !== undefined)
          .map(([col, c]) => {
            const r = `${col}${rn}`;
            if (typeof c === "number") return `<c r="${r}"><v>${c}</v></c>`;
            if (typeof c === "string") {
              shared.push(`<si><t xml:space="preserve">${esc(c)}</t></si>`);
              return `<c r="${r}" t="s"><v>${shared.length - 1}</v></c>`;
            }
            if ("inline" in c!) return `<c r="${r}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
            const runs = c!.rich.map((t, i) => `<r>${i ? "<rPr><b/></rPr>" : ""}<t xml:space="preserve">${esc(t)}</t></r>`).join("");
            const ruby = c!.ruby ? `<rPh sb="0" eb="1"><t>${esc(c!.ruby)}</t></rPh><phoneticPr fontId="1"/>` : "";
            shared.push(`<si>${runs}${ruby}</si>`);
            return `<c r="${r}" t="s"><v>${shared.length - 1}</v></c>`;
          })
          .join("");
        return `<row r="${rn}">${cs}</row>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.join("")}</sst>`),
  };
  sheetXml.forEach((x, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(x)));
  return zipSync(files, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}
