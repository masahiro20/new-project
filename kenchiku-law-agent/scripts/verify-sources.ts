// Re-fetches every article the knowledge base cites from the e-Gov 法令API,
// checks the article caption against what the rule expects, and writes
// data/law-snapshot.json (caption, revision id and a hash of the text) so changes
// between runs are visible without mirroring the full text into the repository.
//
//   npm run verify-sources            # verify and update the snapshot
//   npm run verify-sources -- --check # verify only, exit 1 on any mismatch

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { RULES } from "../lib/knowledge";
import { LAWS, articleLabel, type LawKey } from "../lib/laws";
import { fetchArticle, type Article } from "../lib/egov";

type Snapshot = {
  verifiedAt: string;
  articles: Record<string, { law: string; lawId: string; article: string; label: string; caption: string; revisionId: string; enforcementDate: string | null; url: string; textHash: string }>;
};

const checkOnly = process.argv.includes("--check");
const snapshotPath = new URL("../data/law-snapshot.json", import.meta.url);

let previous: Snapshot | null = null;
try {
  previous = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
} catch {
  previous = null;
}

const wanted = new Map<string, { law: LawKey; article: string; expect: Set<string>; rules: string[] }>();
for (const rule of RULES) {
  for (const c of rule.cites) {
    const key = `${LAWS[c.law].id}:${c.article}`;
    const entry = wanted.get(key) ?? { law: c.law, article: c.article, expect: new Set<string>(), rules: [] };
    if (c.expectCaption) entry.expect.add(c.expectCaption);
    entry.rules.push(rule.id);
    wanted.set(key, entry);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {

  const next: Snapshot = { verifiedAt: new Date().toISOString(), articles: {} };
  let failures = 0;
  let changed = 0;

  for (const [key, w] of wanted) {
    let art: Article | null = null;
    try {
      art = await fetchArticle(LAWS[w.law].id, w.article);
    } catch (e) {
      console.log(`ERR  ${LAWS[w.law].title} ${articleLabel(w.article)}: ${e instanceof Error ? e.message : e}`);
      failures++;
      continue;
    }
    if (!art) {
      console.log(`MISS ${LAWS[w.law].title} ${articleLabel(w.article)} — 条が見つかりません（rules: ${w.rules.join(", ")}）`);
      failures++;
      continue;
    }
    const captionOk = w.expect.size === 0 || w.expect.has(art.caption);
    const prev = previous?.articles[key];
    const revisionChanged = prev && prev.revisionId !== art.revisionId;
    const textHash = createHash("sha256").update(art.text).digest("hex");
    const textChanged = prev && prev.textHash !== textHash;
    if (!captionOk) {
      failures++;
      console.log(`FAIL ${art.lawTitle} ${art.label} 見出し不一致: 期待 ${[...w.expect].join("|")} / 実際 ${art.caption || "（見出しなし）"}（rules: ${w.rules.join(", ")}）`);
    } else if (revisionChanged || textChanged) {
      changed++;
      console.log(`CHG  ${art.lawTitle} ${art.label}${art.caption} 現行版 ${prev?.revisionId} -> ${art.revisionId}${textChanged ? "（本文変更あり）" : ""}（rules: ${w.rules.join(", ")}）`);
    } else {
      console.log(`ok   ${art.lawTitle} ${art.label}${art.caption}`);
    }
    next.articles[key] = {
      law: art.lawTitle,
      lawId: art.lawId,
      article: art.article,
      label: art.label,
      caption: art.caption,
      revisionId: art.revisionId,
      enforcementDate: art.enforcementDate,
      url: art.url,
      textHash,
    };
    await sleep(120);
  }

  console.log(`\n${wanted.size} 条を照合：不一致 ${failures}、変更検知 ${changed}`);
  if (!checkOnly) {
    writeFileSync(snapshotPath, JSON.stringify(next, null, 1) + "\n");
    console.log(`data/law-snapshot.json を更新しました（${next.verifiedAt}）`);
  }
  if (failures > 0 || (checkOnly && changed > 0)) process.exit(1);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
