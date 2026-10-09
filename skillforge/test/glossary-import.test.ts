import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseGlossary, parseGlossaryWithNotes, parseTable, runChecks, type Glossary } from "../src/core/index.js";
import { parseXml, textContent } from "../src/core/parsers/xml.js";
import { read } from "./helpers.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const term = (g: Glossary, source: string) => g.terms.find((t) => t.source === source);

const tbx2 = (body: string, rootLang = "en") => `<?xml version="1.0"?>
<martif type="TBX-Basic" xml:lang="${rootLang}"><martifHeader/><text><body>${body}</body></text></martif>`;

test("TBX v2 (martif): preferred → target, admitted → allowed, deprecated/superseded → forbidden, other langs ignored", () => {
  const r = parseGlossaryWithNotes(
    tbx2(`
    <termEntry id="1">
      <descrip type="definition">Stone &amp; power</descrip>
      <langSet xml:lang="ja-JP"><tig><term>魔導石</term></tig></langSet>
      <langSet xml:lang="en-US">
        <tig><term>Magic Stone</term><termNote type="administrativeStatus">deprecatedTerm-admn-sts</termNote></tig>
        <tig><term>Mana Stone</term><termNote type="administrativeStatus">preferredTerm-admn-sts</termNote></tig>
        <tig><term>Manastone</term><termNote type="administrativeStatus">admittedTerm-admn-sts</termNote></tig>
        <tig><term>Mana Rock</term><termNote type="administrativeStatus">supersededTerm-admn-sts</termNote></tig>
      </langSet>
      <langSet xml:lang="fr"><tig><term>Pierre de mana</term></tig></langSet>
    </termEntry>`),
    "terms.tbx",
    { sourceLang: "ja" },
  );
  assert.equal(r.format, "tbx");
  assert.deepEqual(r.glossary.terms, [{ source: "魔導石", target: "Mana Stone", allowed: ["Manastone"], forbidden: ["Magic Stone", "Mana Rock"], note: "Stone & power" }]);
  assert.deepEqual(r.glossary.characters, []);
  assert.ok(r.notes.some((n) => /ignored languages: fr/.test(n)));
});

test("TBX v3 (tbx root, conceptEntry/langSec/termSec, short status values, prefixed DCT elements)", () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<tbx type="TBX-Basic" style="dca" xml:lang="ja" xmlns="urn:iso:std:iso:30042:ed-2" xmlns:basic="http://www.tbxinfo.net/ns/basic">
  <tbxHeader><fileDesc><sourceDesc><p>x</p></sourceDesc></fileDesc></tbxHeader>
  <text><body>
    <conceptEntry id="c1">
      <langSec xml:lang="ja"><termSec><term>星詠み</term></termSec></langSec>
      <langSec xml:lang="en">
        <termSec><term>Stargazer</term><termNote type="administrativeStatus">preferred</termNote></termSec>
        <termSec><term>Star Reader</term><termNote type="administrativeStatus">deprecated</termNote></termSec>
        <termSec><term>Star-reader</term><basic:administrativeStatus>supersededTerm-admn-sts</basic:administrativeStatus></termSec>
        <termSec><term>Star Seer</term><termNote type="administrativeStatus">admitted</termNote><note>rare</note></termSec>
      </langSec>
    </conceptEntry>
  </body></text>
</tbx>`;
  const g = parseGlossary(text, "v3.tbx");
  assert.deepEqual(g.terms, [{ source: "星詠み", target: "Stargazer", allowed: ["Star Seer"], forbidden: ["Star Reader", "Star-reader"], note: "rare" }]);
});

test("TBX direction: root xml:lang is the default, sourceLang overrides; only-deprecated sources are skipped", () => {
  const body = `<termEntry>
    <langSet xml:lang="ja"><tig><term>魔導石</term><termNote type="administrativeStatus">preferredTerm-admn-sts</termNote></tig></langSet>
    <langSet xml:lang="en">
      <tig><term>Mana Stone</term><termNote type="administrativeStatus">preferredTerm-admn-sts</termNote></tig>
      <tig><term>Magic Stone</term><termNote type="administrativeStatus">deprecatedTerm-admn-sts</termNote></tig>
    </langSet></termEntry>`;
  const enRoot = parseGlossaryWithNotes(tbx2(body, "en"), "a.tbx");
  assert.deepEqual(enRoot.direction, { source: "en", target: "ja" });
  assert.deepEqual(enRoot.glossary.terms, [{ source: "Mana Stone", target: "魔導石" }]);
  const ja = parseGlossaryWithNotes(tbx2(body, "en"), "a.tbx", { sourceLang: "ja" });
  assert.deepEqual(ja.glossary.terms, [{ source: "魔導石", target: "Mana Stone", forbidden: ["Magic Stone"] }]);
  const noLang = parseGlossaryWithNotes(tbx2(body, "de"), "a.tbx");
  assert.deepEqual(noLang.direction, { source: "ja", target: "en" });
});

test("XML reader: entities (predefined, numeric, internal DTD), CDATA, comments, namespaces, line numbers", () => {
  const doc = parseXml(`<?xml version="1.0"?>
<!DOCTYPE r [ <!ENTITY game "Ember &amp; Ash"> ]>
<!-- comment <not-a-tag> -->
<x:r xmlns:x="urn:x" a='1 &lt; 2'>
  <x:t>&game; &#x9B54;&#23566;石 &quot;q&quot;</x:t>
  <t><![CDATA[<b>raw & bold</b>]]></t>
</x:r>`);
  assert.equal(doc.name, "r");
  assert.equal(doc.attrs.a, "1 < 2");
  const ts = doc.children.filter((c) => typeof c !== "string");
  assert.equal(textContent(ts[0] as never), 'Ember & Ash 魔導石 "q"');
  assert.equal(textContent(ts[1] as never), "<b>raw & bold</b>");
  assert.equal((ts[1] as { line: number }).line, 6);
  assert.throws(() => parseXml("<a><b></a>"), /does not close/);
});

test("TBX in UTF-16 (LE and BE, with BOM) as bytes", () => {
  const text = tbx2(`<termEntry><langSet xml:lang="ja"><tig><term>灰の書庫</term></tig></langSet><langSet xml:lang="en"><tig><term>Ashen Archive</term></tig></langSet></termEntry>`, "ja");
  const le = new Uint8Array(2 + text.length * 2);
  const be = new Uint8Array(2 + text.length * 2);
  le.set([0xff, 0xfe]);
  be.set([0xfe, 0xff]);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    le[2 + i * 2] = c & 0xff;
    le[3 + i * 2] = c >> 8;
    be[2 + i * 2] = c >> 8;
    be[3 + i * 2] = c & 0xff;
  }
  for (const bytes of [le, be]) assert.deepEqual(parseGlossary(bytes, "export.tbx").terms, [{ source: "灰の書庫", target: "Ashen Archive" }]);
  assert.throws(() => parseGlossary("<root/>", "x.xml"), /must be TBX/);
});

test("Kotomark CSV (type,source,target,allowed,forbidden,note) still parses as before", () => {
  const g = parseGlossary("type,source,target,allowed,forbidden,note\nterm,魔導石,Mana Stone,,Magic Stone;Mana Rock,stone\ncharacter,リゼット,Lisette,Liz,Lizette,\n", "g.csv");
  assert.deepEqual(g.terms, [{ source: "魔導石", target: "Mana Stone", forbidden: ["Magic Stone", "Mana Rock"], note: "stone" }]);
  assert.deepEqual(g.characters, [{ id: "lisette", ja: "リゼット", en: "Lisette", aliases: { en: ["Liz"] }, forbidden: { en: ["Lizette"] } }]);
  assert.throws(() => parseGlossary("foo,bar\n1,2\n", "g.csv"), /needs source\/ja and target\/en/);
  // A list-valued forbidden column fixes the direction (its values are target-side renderings).
  assert.equal(parseGlossaryWithNotes("ja,en,forbidden\n魔導石,Mana Stone,Magic Stone\n", "g.csv", { sourceLang: "en" }).glossary.terms[0]!.source, "魔導石");
});

test("bilingual CSV headers: ja,en / Japanese,English / 日本語,英語 / ja-JP,en-US / source,target", () => {
  for (const header of ["ja,en", "Japanese,English", "日本語,英語", "ja-JP,en-US", "ja_JP,en_US", "source,target", "Japanese(ja),English(en)"]) {
    const g = parseGlossary(`${header}\n暁の騎士団,Order of Dawn\n`, "g.csv");
    assert.deepEqual(g.terms, [{ source: "暁の騎士団", target: "Order of Dawn" }], header);
  }
});

test("Crowdin glossary CSV: Term [ja]/Description/Part of speech/Status per language; obsolete → forbidden; repeated sources merge", () => {
  const csv = `Term [ja],Description [ja],Part of Speech [ja],Term [en],Description [en],Part of Speech [en],Status [en],Term [de]
魔導石,魔力を蓄えた石,noun,Mana Stone,,noun,preferred,Manastein
魔導石,,noun,Magic Stone,,noun,obsolete,
魔導石,,noun,Mana Crystal,,noun,preferred,
ルーンゲート,,,Rune Gate,,,,
ルーンゲート,,,Runegate,,,admitted,
`;
  const r = parseGlossaryWithNotes(csv, "crowdin.csv");
  assert.deepEqual(r.glossary.terms, [
    { source: "魔導石", target: "Mana Stone", allowed: ["Mana Crystal"], forbidden: ["Magic Stone"], note: "魔力を蓄えた石" },
    { source: "ルーンゲート", target: "Rune Gate", allowed: ["Runegate"] },
  ]);
  assert.ok(r.notes.some((n) => /several preferred translations/.test(n)));
  assert.ok(r.notes.some((n) => /other languages \(de\)/.test(n)));
});

test("Phrase/Memsource-style CSV: ja,en + note/definition + status or forbidden flag columns; TSV equivalent", () => {
  const csv = "ja,en,definition,status\n星詠み,Stargazer,Seer of stars,approved\n星詠み,Star Reader,,deprecated\n";
  const want = [{ source: "星詠み", target: "Stargazer", forbidden: ["Star Reader"], note: "Seer of stars" }];
  assert.deepEqual(parseGlossary(csv, "phrase.csv").terms, want);
  assert.deepEqual(parseGlossary(csv.replace(/,/g, "\t"), "phrase.tsv").terms, want);
  assert.equal(parseGlossaryWithNotes(csv.replace(/,/g, "\t"), "phrase.tsv").format, "tsv");
  const flag = "ja\ten\tnote\tforbidden\n星詠み\tStargazer\t\t\n星詠み\tStar Reader\told\tyes\n";
  assert.deepEqual(parseGlossary(flag, "flags.txt").terms, [{ source: "星詠み", target: "Stargazer", forbidden: ["Star Reader"], note: "old" }]);
  const perLang = "ja,ja_note,en,en_status\n星詠み,占い師,Stargazer,preferred\n星詠み,,Star Reader,forbidden\n";
  assert.deepEqual(parseGlossary(perLang, "p.csv").terms, [{ source: "星詠み", target: "Stargazer", forbidden: ["Star Reader"], note: "占い師" }]);
});

test("CSV direction: first language column is the default, sourceLang orients it; only-forbidden rows are noted", () => {
  const csv = "English,Japanese\nMana Stone,魔導石\n";
  assert.deepEqual(parseGlossaryWithNotes(csv, "g.csv").direction, { source: "en", target: "ja" });
  assert.deepEqual(parseGlossary(csv, "g.csv").terms, [{ source: "Mana Stone", target: "魔導石" }]);
  assert.deepEqual(parseGlossary(csv, "g.csv", { sourceLang: "ja" }).terms, [{ source: "魔導石", target: "Mana Stone" }]);
  const r = parseGlossaryWithNotes("ja,en,status\n魔導石,Magic Stone,deprecated\n", "g.csv");
  assert.deepEqual(r.glossary.terms, []);
  assert.ok(r.notes.some((n) => /only deprecated\/forbidden/.test(n)));
});

test("samples/glossaries: TBX and Crowdin CSV give the same term findings as the JSON glossary on samples/ja-en", () => {
  const tables = ["samples/ja-en/script.csv", "samples/ja-en/ch2.json"].map((p) => parseTable(read(p), p.split("/").pop()!));
  const termFindings = (g: Glossary) =>
    runChecks(tables, g).findings.filter((f) => f.category === "term").map((f) => `${f.rule} ${f.file}:${f.line} ${f.found ?? ""}→${f.expected ?? ""}`);
  const json = termFindings(parseGlossary(read("samples/ja-en/glossary.json"), "glossary.json"));
  assert.ok(json.length > 0);
  const tbx = parseGlossary(readFileSync(join(root, "samples/glossaries/glossary.tbx")), "glossary.tbx");
  const crowdin = parseGlossary(read("samples/glossaries/crowdin-glossary.csv"), "crowdin-glossary.csv");
  assert.deepEqual(termFindings(tbx), json);
  assert.deepEqual(termFindings(crowdin), json);
  assert.deepEqual(term(tbx, "魔導石")?.forbidden, ["Magic Stone"]);
  assert.deepEqual(term(crowdin, "ルーンゲート")?.allowed, ["Runegate"]);
});

test("CLI: glossary convert writes Kotomark JSON; check --glossary x.tbx works and orients to the script", () => {
  const dir = mkdtempSync(join(tmpdir(), "kotomark-gl-"));
  const cli = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", join(root, "src/cli/index.ts"), ...args], { cwd: root, encoding: "utf8" });
  const out = join(dir, "g.json");
  const conv = cli(["glossary", "convert", "samples/glossaries/glossary.tbx", "--out", out]);
  assert.equal(conv.status, 0, conv.stderr);
  assert.match(conv.stderr, /TBX, 5 term\(s\) read as ja→en/);
  const g = JSON.parse(readFileSync(out, "utf8")) as Glossary;
  assert.equal(g.terms.length, 5);
  assert.deepEqual(parseGlossary(readFileSync(out, "utf8"), "g.json").terms, g.terms);
  const check = cli(["check", "samples/ja-en/script.csv", "--glossary", "samples/glossaries/glossary.tbx", "--json", "--fail-on", "never"]);
  assert.equal(check.status, 0, check.stderr);
  const r = JSON.parse(check.stdout) as { findings: { rule: string; found?: string }[] };
  assert.ok(r.findings.some((f) => f.rule === "term.forbidden" && f.found === "Magic Stone"));
  // An EN→JA script reads the same TBX in the en→ja direction (no term.direction warning).
  const enja = cli(["check", "samples/en-ja/ui.xlf", "--glossary", "samples/glossaries/glossary.tbx", "--json", "--fail-on", "never"]);
  assert.equal(enja.status, 0, enja.stderr);
  assert.match(enja.stderr, /read as en→ja/);
  assert.ok(!(JSON.parse(enja.stdout) as { findings: { rule: string }[] }).findings.some((f) => f.rule === "term.direction"));
});

test("MCP: validate_glossary / save_glossary / check_script accept TBX with a filename hint", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { buildServer, devContext } = await import("../src/server/tools.js");
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildServer(devContext()).connect(b);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(a);
  const tbx = read("samples/glossaries/glossary.tbx");
  const v = await client.callTool({ name: "validate_glossary", arguments: { content: tbx, filename: "glossary.tbx" } });
  assert.ok(!v.isError);
  const sc = v.structuredContent as { terms: number; format: string; notes: string[] };
  assert.equal(sc.terms, 5);
  assert.equal(sc.format, "tbx");
  assert.ok(sc.notes.some((n) => /ignored languages: de/.test(n)));
  const saved = await client.callTool({ name: "save_glossary", arguments: { name: "tbx", content: tbx, filename: "glossary.tbx" } });
  assert.ok(!saved.isError);
  const checked = await client.callTool({
    name: "check_script",
    arguments: { tables: [{ filename: "script.csv", content: read("samples/ja-en/script.csv") }], glossary: { filename: "glossary.tbx", content: tbx } },
  });
  assert.match((checked.content as { text: string }[])[0]!.text, /Magic Stone/);
  await client.close();
});
