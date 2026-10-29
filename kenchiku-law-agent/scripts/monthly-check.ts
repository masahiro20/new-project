// 月1回の点検：①同梱の法令集より新しい版が e-Gov に出ていないか ②登録した市の公開地図・窓口ページの
// リンクが生きているか を確かめて、Markdown で報告する。直すのは人が判断してから（ここでは何も書き換えない）。
// 条文の見出し照合は `npm run verify-sources`、法令集の更新は `npm run build-lawbook`。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MUNICIPALITIES, VERIFIED_AT } from "../lib/municipal";

/** 国外からの接続を制限していて、点検の環境（クラウド）から開けないことが分かっているサイト。 */
const GEO_LIMITED = ["logoform.jp", "webgis.alandis.jp", "sonicweb-asp.jp"];

type IndexEntry = { lawId: string; title: string; revisionId: string; enforcementDate: string | null };

async function latestRevision(lawId: string): Promise<{ revisionId: string; enforcementDate: string | null } | null> {
  const res = await fetch(`https://laws.e-gov.go.jp/api/2/law_revisions/${lawId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const d = (await res.json()) as { revisions?: { law_revision_id: string; amendment_enforcement_date: string | null; current_revision_status?: string }[] };
  const today = new Date().toISOString().slice(0, 10);
  // 施行済みの最新版（未施行の改正は別に数える）
  const revs = (d.revisions ?? []).filter((r) => !r.amendment_enforcement_date || r.amendment_enforcement_date <= today);
  revs.sort((a, b) => (b.amendment_enforcement_date ?? "").localeCompare(a.amendment_enforcement_date ?? ""));
  return revs[0] ? { revisionId: revs[0].law_revision_id, enforcementDate: revs[0].amendment_enforcement_date } : null;
}

async function upcoming(lawId: string): Promise<string[]> {
  const res = await fetch(`https://laws.e-gov.go.jp/api/2/law_revisions/${lawId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const d = (await res.json()) as { revisions?: { amendment_enforcement_date: string | null }[] };
  const today = new Date().toISOString().slice(0, 10);
  return (d.revisions ?? []).map((r) => r.amendment_enforcement_date).filter((x): x is string => Boolean(x && x > today));
}

async function linkStatus(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "kenchiku-law-agent monthly check" } });
    return res.status;
  } catch (e) {
    return e instanceof Error ? e.name : "error";
  }
}

async function main() {
  const lines: string[] = [`# 月次点検（${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）`, ""];

  lines.push("## 法令集（同梱版と e-Gov の現行版）");
  const index = JSON.parse(readFileSync(join(process.cwd(), "data", "lawbook", "index.json"), "utf8")) as IndexEntry[];
  let stale = 0;
  for (const l of index) {
    const cur = await latestRevision(l.lawId).catch(() => null);
    const next = await upcoming(l.lawId).catch(() => []);
    const changed = cur && cur.revisionId !== l.revisionId;
    if (changed) stale++;
    lines.push(
      `- ${changed ? "【更新あり】" : "変更なし"} ${l.title}：同梱 ${l.enforcementDate ?? "?"} 施行版${changed ? ` → 現行 ${cur!.enforcementDate ?? "?"} 施行版` : ""}${next.length ? `（今後の施行予定：${[...new Set(next)].sort().join("、")}）` : ""}`,
    );
  }
  lines.push(stale ? `\n→ ${stale}件の法令に新しい版があります。\`npm run build-lawbook\` と \`npm run verify-sources\`、\`npm test\` を実行して要点の照合を確認してください。` : "\n→ 同梱の法令集は最新です。", "");

  lines.push(`## 市の公開地図・窓口ページ（登録 ${VERIFIED_AT}）`);
  let broken = 0;
  const geo: string[] = [];
  for (const m of MUNICIPALITIES) {
    const links = [m.road, m.ledger, m.water, m.sewer, m.gas].flatMap((o) => o.links).concat(m.planMap ? [m.planMap] : []);
    const seen = new Set<string>();
    for (const l of links) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      const s = await linkStatus(l.url);
      if (s === 200) continue;
      if (GEO_LIMITED.some((h) => l.url.includes(h))) {
        geo.push(`${m.city}：${l.label}（${s}）`);
        continue;
      }
      broken++;
      lines.push(`- 【要確認】${m.city}：${l.label}（${s}）${l.url}`);
    }
  }
  if (geo.length) lines.push(`- 参考：国外からの接続を制限しているサイトは点検の環境から開けないため除外（${geo.length}件：${geo.join("、")}）。社内のパソコンから開けるかは別途確認。`);
  lines.push(broken ? `\n→ ${broken}件のリンクが開けませんでした。各市のページで新しいURLを確かめ、lib/municipal.ts を直してください。` : "- 確認できたリンクはすべて開けました。", "");
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
