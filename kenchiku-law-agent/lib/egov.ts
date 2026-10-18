// Client for the e-Gov 法令API v2 (https://laws.e-gov.go.jp/api/2/...).
// Every article the agent cites is fetched from here, so the text shown to
// users is the current enforced revision, not something a model remembered.

import { LAWS, articleLabel, type LawKey } from "./laws";

const API = "https://laws.e-gov.go.jp/api/2";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type Node = string | { tag: string; attr?: Record<string, string>; children?: Node[] };

export type Article = {
  lawId: string;
  lawTitle: string;
  lawNum: string;
  article: string;
  label: string;
  caption: string;
  text: string;
  revisionId: string;
  enforcementDate: string | null;
  url: string;
  fetchedAt: string;
};

export type LawHit = {
  lawId: string;
  title: string;
  lawNum: string;
  enforcementDate: string | null;
  url: string;
};

export type KeywordHit = LawHit & { sentences: string[] };

const cache = new Map<string, { at: number; value: Article }>();

export function lawUrl(lawId: string, article?: string): string {
  return article ? `${API.replace("/api/2", "")}/law/${lawId}#Mp-At_${article}` : `${API.replace("/api/2", "")}/law/${lawId}`;
}

function textOf(n: Node | undefined): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  return (n.children ?? []).map(textOf).join("");
}

function children(n: Node, tag: string) {
  if (typeof n === "string") return [];
  return (n.children ?? []).filter((c): c is Exclude<Node, string> => typeof c !== "string" && c.tag === tag);
}

/** Flattens the API's JSON tree into readable text that keeps 項・号 structure. */
function renderArticle(art: Exclude<Node, string>): { caption: string; text: string } {
  const caption = textOf(children(art, "ArticleCaption")[0]);
  const title = textOf(children(art, "ArticleTitle")[0]);
  const lines: string[] = [];

  const renderItems = (n: Exclude<Node, string>, indent: string) => {
    for (const c of n.children ?? []) {
      if (typeof c === "string") continue;
      if (/^(Item|Subitem\d)$/.test(c.tag)) {
        const titleTag = `${c.tag}Title`;
        const sentenceTag = `${c.tag}Sentence`;
        const t = textOf(children(c, titleTag)[0]);
        const s = textOf(children(c, sentenceTag)[0]);
        lines.push(`${indent}${t}　${s}`.trimEnd());
        renderItems(c, indent + "　");
      } else if (c.tag === "TableStruct" || c.tag === "List") {
        const rows: string[] = [];
        const walk = (x: Node) => {
          if (typeof x === "string") return;
          if (x.tag === "TableRow") rows.push((x.children ?? []).map(textOf).map((v) => v.trim()).join(" ｜ "));
          else (x.children ?? []).forEach(walk);
        };
        walk(c);
        for (const r of rows) lines.push(`${indent}　${r}`);
      }
    }
  };

  for (const p of children(art, "Paragraph")) {
    const num = textOf(children(p, "ParagraphNum")[0]);
    const sentence = textOf(children(p, "ParagraphSentence")[0]);
    lines.push(`${num || title}　${sentence}`.trim());
    renderItems(p, "　");
  }
  return { caption, text: lines.join("\n") };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`e-Gov API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Fetches one article (e.g. "43", "6_4") of a law and returns its current text. */
export async function fetchArticle(lawId: string, article: string): Promise<Article | null> {
  const key = `${lawId}:${article}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url = `${API}/law_data/${encodeURIComponent(lawId)}?law_full_text_format=json&elm=MainProvision-Article_${encodeURIComponent(article)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } } as RequestInit);
  if (res.status === 400 || res.status === 404) return null; // 400021: element not found
  if (!res.ok) throw new Error(`e-Gov API ${res.status}`);
  const data = (await res.json()) as {
    law_info: { law_id: string; law_num: string };
    revision_info: { law_revision_id: string; law_title: string; amendment_enforcement_date: string | null };
    law_full_text?: Exclude<Node, string>;
  };
  if (!data.law_full_text) return null;
  const { caption, text } = renderArticle(data.law_full_text);
  const value: Article = {
    lawId: data.law_info.law_id,
    lawTitle: data.revision_info.law_title,
    lawNum: data.law_info.law_num,
    article,
    label: articleLabel(article),
    caption,
    text,
    revisionId: data.revision_info.law_revision_id,
    enforcementDate: data.revision_info.amendment_enforcement_date,
    url: lawUrl(data.law_info.law_id, article),
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function fetchArticleByKey(law: LawKey, article: string) {
  return fetchArticle(LAWS[law].id, article);
}

type LawsResponse = {
  laws: {
    law_info: { law_id: string; law_num: string };
    revision_info: { law_title: string; amendment_enforcement_date: string | null; repeal_status: string };
  }[];
};

/** Looks laws up by (partial) title. */
export async function searchLaws(title: string, limit = 10): Promise<LawHit[]> {
  const data = await getJson<LawsResponse>(`${API}/laws?law_title=${encodeURIComponent(title)}&limit=${limit}`);
  return (data.laws ?? [])
    .filter((l) => l.revision_info.repeal_status === "None")
    .map((l) => ({
      lawId: l.law_info.law_id,
      title: l.revision_info.law_title,
      lawNum: l.law_info.law_num,
      enforcementDate: l.revision_info.amendment_enforcement_date,
      url: lawUrl(l.law_info.law_id),
    }));
}

type KeywordResponse = {
  items: {
    law_info: { law_id: string; law_num: string };
    revision_info: { law_title: string; amendment_enforcement_date: string | null };
    sentences: { position: string; text: string }[];
  }[];
};

/** Full-text keyword search across all laws (the API highlights matches with <span>). */
export async function keywordSearch(keyword: string, limit = 8): Promise<KeywordHit[]> {
  const data = await getJson<KeywordResponse>(`${API}/keyword?keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
  return (data.items ?? []).map((it) => ({
    lawId: it.law_info.law_id,
    title: it.revision_info.law_title,
    lawNum: it.law_info.law_num,
    enforcementDate: it.revision_info.amendment_enforcement_date,
    url: lawUrl(it.law_info.law_id),
    sentences: it.sentences.map((s) => s.text.replace(/<\/?span>/g, "")),
  }));
}
