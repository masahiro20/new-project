// renderMarkdown のエスケープ（Atlas の X-5）：ファイル名・ID・グループ名・メッセージ（台本の文）が、
// HTML をそのまま描画する Markdown ビューアに貼られても、タグ・リンク・コードスパン・強調・新しいブロックを作らないこと。
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, type CheckResult, type Finding } from "../src/core/index.js";
import { mdCode, mdText } from "../src/core/report.js";

const EVIL = [
  "x</code><img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
  "[link](javascript:alert(1))",
  "![img](javascript:alert(1))",
  "[a] (javascript:alert(1))",
  "<javascript:alert(1)>",
  "a`b``c```",
  "`",
  "a|b||c",
  "line1\nline2\r\n# heading\n<img src=x onerror=alert(1)>\n| a | b |\n|---|---|",
  "**bold** _em_ ~~del~~",
  "&lt;img src=x onerror=alert(1)&gt;",
  "\\<img src=x onerror=alert(1)>",
  "<!-- comment",
];

function result(value: string): CheckResult {
  const f: Finding = { category: "term", severity: "error", rule: "term.forbidden", file: value, line: 3, id: value, side: "target", message: `Bad ${value}`, group: value };
  return {
    tables: [{ file: value, format: "csv", rows: 1, sourceLang: "ja", targetLang: "en" }],
    glossary: { terms: 1, characters: 0 },
    findings: [f],
    usage: [{ category: "term", group: value, counts: { [value]: 2, ok: 1 } }],
    reviewPackets: [{ kind: "voice", subject: value, instructions: "", lines: [{ ref: "a:1", id: "1", source: "s", target: "t" }] }],
  };
}

/** Removes code spans as CommonMark does (fence of N backticks closes on a run of exactly N). */
function stripCodeSpans(md: string): string {
  return md.replace(/(?<![\\`])(`+)([\s\S]*?[^`])\1(?!`)/g, " CODE ");
}

test("mdCode: fence longer than any backtick run, one line, ordinary values unchanged", () => {
  assert.equal(mdCode("script.csv:12"), "`script.csv:12`");
  assert.equal(mdCode("ch1_023"), "`ch1_023`");
  assert.equal(mdCode("a`b"), "``a`b``");
  assert.equal(mdCode("a`b``c```"), "```` a`b``c``` ````");
  assert.equal(mdCode("`"), "`` ` ``");
  assert.equal(mdCode("`x`"), "`` `x` ``");
  assert.equal(mdCode(" x "), "`  x  `");
  assert.equal(mdCode("a\nb\r\nc"), "`a b c`");
  assert.equal(mdCode("x</code><img src=x onerror=alert(1)>"), "`x</code><img src=x onerror=alert(1)>`");
});

test("mdText: no raw HTML, links, emphasis or line breaks; ordinary text unchanged", () => {
  for (const s of ["魔導石 → Mana Stone", "missing [PLAYER] {player_name} %1$s ${gold}", "Magic Stone", "C:\\dir\\file", "a | b", "R&D"]) assert.equal(mdText(s), s, s);
  assert.equal(mdText("x</code><img src=x onerror=alert(1)>"), "x&lt;/code&gt;&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(mdText("[link](javascript:alert(1))"), "[link\\](javascript:alert(1))");
  assert.equal(mdText("[a] (javascript:x)"), "[a\\] (javascript:x)");
  assert.equal(mdText("**b** _e_ ~~d~~ `c`"), "\\*\\*b\\*\\* \\_e\\_ \\~\\~d\\~\\~ \\`c\\`");
  assert.equal(mdText("a\nb\r\n# c"), "a b # c");
  assert.equal(mdText("&lt;"), "&amp;lt;");
  assert.equal(mdText("\\<b>"), "\\\\&lt;b&gt;");
  assert.equal(mdText("\\[x](y)"), "\\\\[x\\](y)");
});

test("renderMarkdown: malicious file names, ids, groups and messages cannot inject markup", () => {
  for (const v of EVIL) {
    const md = renderMarkdown(result(v));
    const plain = stripCodeSpans(md);
    assert.doesNotMatch(plain, /<[A-Za-z/!?]/, `raw HTML or autolink for ${JSON.stringify(v)}:\n${md}`);
    assert.doesNotMatch(plain, /(?<!\\)\]\s*\(/, `inline link for ${JSON.stringify(v)}`);
    const unescaped = plain.replace(/\\[\s\S]/g, "").replace(/^- \*\*(.*)\*\* — /gm, "- $1 — ");
    assert.doesNotMatch(unescaped, /[*`~]/, `emphasis or code span for ${JSON.stringify(v)}`);
    assert.doesNotMatch(unescaped, /(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u, `emphasis for ${JSON.stringify(v)}`);
    // Every line is one the report itself writes: nothing in a value starts a new block.
    for (const line of md.split("\n")) assert.match(line, /^(?:$|# |## |### |- |\||Usage: |\d+ packet\(s\))/, `unexpected line ${JSON.stringify(line)} for ${JSON.stringify(v)}`);
    // The code spans (file:line and id) keep the value intact, on one line.
    assert.ok(md.includes(mdCode(`${v}:3`)), `location code span for ${JSON.stringify(v)}`);
  }
});

test("renderMarkdown: ordinary reports are unchanged by the escaping", () => {
  const plain = result("scenes/ch_01.csv");
  plain.findings[0]!.message = 'Bad "Magic Stone"; glossary says "Mana Stone".';
  plain.findings[0]!.group = "魔導石 → Mana Stone";
  plain.usage[0]!.group = "魔導石 → Mana Stone";
  const md = renderMarkdown(plain);
  assert.ok(md.includes("- **scenes/ch_01.csv** — CSV, 1 rows, ja → en"));
  assert.ok(md.includes("### 魔導石 → Mana Stone\nUsage: scenes/ch_01.csv ×2 · ok ×1"));
  assert.ok(md.includes('- ❌ `scenes/ch_01.csv:3` `scenes/ch_01.csv` (target) — Bad "Magic Stone"; glossary says "Mana Stone".'));
});
