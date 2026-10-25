// 法令集（同梱版）を作る：e-Gov 法令API v2 から現行の全文を取得し、条ごと・別表ごとに
// data/lawbook/<法令ID>.json へ保存する。`npm run build-lawbook` で更新する。

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAWBOOK_LAWS } from "../lib/lawbook-list";

const API = "https://laws.e-gov.go.jp/api/2";
type Node = string | { tag: string; attr?: Record<string, string>; children?: Node[] };
type El = Exclude<Node, string>;

// Ruby readings (<Rt>) are dropped so 「竪たて穴」 reads 「竪穴」.
const textOf = (n: Node | undefined): string => (!n ? "" : typeof n === "string" ? n : n.tag === "Rt" ? "" : (n.children ?? []).map(textOf).join(""));
const kids = (n: Node, tag: string): El[] => (typeof n === "string" ? [] : (n.children ?? []).filter((c): c is El => typeof c !== "string" && c.tag === tag));

function tableRows(n: Node, indent: string, out: string[]) {
  const walk = (x: Node) => {
    if (typeof x === "string") return;
    if (x.tag === "TableRow") out.push(`${indent}${(x.children ?? []).map(textOf).map((v) => v.replace(/\s+/g, " ").trim()).join(" ｜ ")}`);
    else (x.children ?? []).forEach(walk);
  };
  walk(n);
}

function renderItems(n: El, indent: string, out: string[]) {
  for (const c of n.children ?? []) {
    if (typeof c === "string") continue;
    if (/^(Item|Subitem\d+)$/.test(c.tag)) {
      out.push(`${indent}${textOf(kids(c, `${c.tag}Title`)[0])}　${textOf(kids(c, `${c.tag}Sentence`)[0])}`.trimEnd());
      renderItems(c, indent + "　", out);
    } else if (c.tag === "TableStruct" || c.tag === "List") tableRows(c, `${indent}　`, out);
  }
}

function renderArticle(art: El) {
  const out: string[] = [];
  const title = textOf(kids(art, "ArticleTitle")[0]);
  for (const p of kids(art, "Paragraph")) {
    out.push(`${textOf(kids(p, "ParagraphNum")[0]) || title}　${textOf(kids(p, "ParagraphSentence")[0])}`.trim());
    renderItems(p, "　", out);
  }
  return { caption: textOf(kids(art, "ArticleCaption")[0]), title, text: out.join("\n") };
}

/** Collects every Article under MainProvision (through Part/Chapter/Section/Subsection/Division). */
function collectArticles(n: Node, acc: El[]) {
  if (typeof n === "string") return;
  if (n.tag === "Article") acc.push(n);
  else if (n.tag !== "SupplProvision") (n.children ?? []).forEach((c) => collectArticles(c, acc));
}

function renderAppendix(n: El): { title: string; text: string } {
  const title = textOf(kids(n, `${n.tag}Title`)[0]) || textOf(n).slice(0, 20);
  const out: string[] = [];
  const walk = (x: Node) => {
    if (typeof x === "string") return;
    if (x.tag === "TableStruct") tableRows(x, "", out);
    else if (x.tag === "Sentence" || x.tag === "Remarks") out.push(textOf(x).trim());
    else (x.children ?? []).forEach(walk);
  };
  (n.children ?? []).forEach((c) => typeof c !== "string" && !c.tag.endsWith("Title") && walk(c));
  return { title, text: out.filter(Boolean).join("\n") };
}

async function build(lawId: string) {
  const res = await fetch(`${API}/law_data/${lawId}?law_full_text_format=json`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${lawId}: ${res.status}`);
  const data = (await res.json()) as {
    law_info: { law_id: string; law_num: string };
    revision_info: { law_revision_id: string; law_title: string; amendment_enforcement_date: string | null };
    law_full_text: El;
  };
  const arts: El[] = [];
  const main = (function find(n: Node): El | null {
    if (typeof n === "string") return null;
    if (n.tag === "MainProvision") return n;
    for (const c of n.children ?? []) {
      const f = find(c);
      if (f) return f;
    }
    return null;
  })(data.law_full_text);
  if (main) collectArticles(main, arts);
  const appendix: { title: string; text: string }[] = [];
  (function findAppdx(n: Node) {
    if (typeof n === "string") return;
    if (/^Appdx(Table|Note|Style|Format|Fig)?$/.test(n.tag)) appendix.push(renderAppendix(n));
    else if (n.tag !== "SupplProvision") (n.children ?? []).forEach(findAppdx);
  })(data.law_full_text);
  const articles = arts.map((a) => ({ article: a.attr?.Num ?? "", ...renderArticle(a) })).filter((a) => a.article && a.text);
  return {
    lawId: data.law_info.law_id,
    lawNum: data.law_info.law_num,
    title: data.revision_info.law_title,
    revisionId: data.revision_info.law_revision_id,
    enforcementDate: data.revision_info.amendment_enforcement_date,
    fetchedAt: new Date().toISOString(),
    articles,
    appendix: appendix.filter((x) => x.text),
  };
}

async function main() {
  const dir = join(process.cwd(), "data", "lawbook");
  mkdirSync(dir, { recursive: true });
  const index: { lawId: string; title: string; short: string; revisionId: string; enforcementDate: string | null; articles: number; appendix: number; fetchedAt: string }[] = [];
  for (const l of LAWBOOK_LAWS) {
    const b = await build(l.id);
    writeFileSync(join(dir, `${l.id}.json`), JSON.stringify(b));
    index.push({ lawId: b.lawId, title: b.title, short: l.short, revisionId: b.revisionId, enforcementDate: b.enforcementDate, articles: b.articles.length, appendix: b.appendix.length, fetchedAt: b.fetchedAt });
    console.log(`${b.title}（${b.enforcementDate} 施行版）：${b.articles.length}条・別表等${b.appendix.length}`);
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
