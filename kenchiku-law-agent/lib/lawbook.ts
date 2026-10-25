// 同梱の法令集（data/lawbook）。e-Gov の現行全文を条・別表ごとに持ち、
// ネットに出ずに条文を引く・全文を検索するために使う（サーバー側のみ）。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lawUrl } from "./egov";
import { LAWBOOK_LAWS } from "./lawbook-list";

export type LawbookArticle = { article: string; title: string; caption: string; text: string };
export type LawbookLaw = {
  lawId: string;
  lawNum: string;
  title: string;
  revisionId: string;
  enforcementDate: string | null;
  fetchedAt: string;
  articles: LawbookArticle[];
  appendix: { title: string; text: string }[];
};
export type LawbookIndexEntry = { lawId: string; title: string; short: string; revisionId: string; enforcementDate: string | null; articles: number; appendix: number; fetchedAt: string };

const dir = () => join(process.cwd(), "data", "lawbook");
const loaded = new Map<string, LawbookLaw | null>();

export function lawbookIndex(): LawbookIndexEntry[] {
  try {
    return JSON.parse(readFileSync(join(dir(), "index.json"), "utf8"));
  } catch {
    return [];
  }
}

export function lawbookLaw(lawId: string): LawbookLaw | null {
  if (!loaded.has(lawId)) {
    try {
      loaded.set(lawId, JSON.parse(readFileSync(join(dir(), `${lawId}.json`), "utf8")));
    } catch {
      loaded.set(lawId, null);
    }
  }
  return loaded.get(lawId) ?? null;
}

export function lawbookArticle(lawId: string, article: string): (LawbookArticle & { law: LawbookLaw }) | null {
  const law = lawbookLaw(lawId);
  const a = law?.articles.find((x) => x.article === article);
  return law && a ? { ...a, law } : null;
}

/** 別表（例：「別表第三」）。 */
export function lawbookAppendix(lawId: string, title: string) {
  return lawbookLaw(lawId)?.appendix.find((x) => x.title.replace(/\s/g, "").startsWith(title.replace(/\s/g, ""))) ?? null;
}

export type LawbookHit = { law: string; short: string; lawId: string; ref: string; caption: string; url: string; snippets: string[]; score: number };

const norm = (s: string) => s.replace(/[\s　]/g, "");

/**
 * 全文検索（空白区切りの語をすべて含む条・別表を返す）。語の出現数と見出しの一致で並べる。
 * scope は短い名前（法・令・規則・都計法…）で絞る。
 */
export function searchLawbook(query: string, opts: { scope?: string[]; limit?: number } = {}): LawbookHit[] {
  const terms = query.split(/[\s　]+/).map(norm).filter(Boolean);
  if (!terms.length) return [];
  const hits: LawbookHit[] = [];
  for (const l of LAWBOOK_LAWS) {
    if (opts.scope?.length && !opts.scope.includes(l.short)) continue;
    const law = lawbookLaw(l.id);
    if (!law) continue;
    const units = [
      ...law.articles.map((a) => ({ ref: a.title || `第${a.article}条`, caption: a.caption, text: a.text, anchor: a.article })),
      ...law.appendix.map((a) => ({ ref: a.title, caption: "", text: a.text, anchor: "" })),
    ];
    for (const u of units) {
      const body = norm(`${u.caption}${u.text}`);
      if (!terms.every((t) => body.includes(t))) continue;
      let score = 0;
      for (const t of terms) score += body.split(t).length - 1 + (norm(u.caption).includes(t) ? 5 : 0);
      const lines = u.text.split("\n");
      const snippets = lines.filter((ln) => terms.some((t) => norm(ln).includes(t))).slice(0, 3).map((ln) => (ln.length > 220 ? `${ln.slice(0, 220)}…` : ln));
      hits.push({ law: law.title, short: l.short, lawId: law.lawId, ref: u.ref, caption: u.caption, url: lawUrl(law.lawId, u.anchor || undefined), snippets, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 8);
}
