// The agent loop. Claude drives tool calls against the e-Gov 法令API (exact
// article text), server-side web search / fetch (official guidance and local
// ordinances), and streams the final Markdown answer. Every tool result and
// web source is also emitted as a `source` event so the UI can list evidence.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fetchArticle, keywordSearch, searchLaws, type Article } from "./egov";
import { LAWS, articleLabel, lawByTitle, normalizeArticle, type LawKey } from "./laws";
import { planToText, type PlanInput } from "./plan";
import { SYSTEM_PROMPT, USER_INSTRUCTION } from "./prompts";
import { findingsToMarkdown, runRules } from "./rules";
import { sourceTier } from "./tier";
import { landFacts } from "./landsummary";
import { REPORT_INPUT_SCHEMA, reportSchema, type PartialReport, type Report } from "./report";
import { FUDE_SOURCE, GSI_VT_SOURCE, lookupSite, mergeSiteIntoPlan, siteToText, type SiteContext } from "./site";

const MODEL = process.env.LAW_AGENT_MODEL ?? "claude-opus-5-5";
const MAX_ITERATIONS = 14;
// Vercel functions stop at 300 s on this plan. Writing the report takes ~1.5 min,
// so research gets a soft budget, after which a mid-conversation system message tells
// the agent to submit with what it has (forced tool_choice is not available on this model).
const WRAP_UP_MS = Number(process.env.CONSULT_WRAPUP_SECONDS ?? 110) * 1000;
const HARD_STOP_MS = Number(process.env.CONSULT_HARDSTOP_SECONDS ?? 150) * 1000;
const WRAP_UP_NOTE =
  "残り時間が少なくなりました。追加の Web 検索・取得はせず、ここまでに取得した条文・資料を根拠に、今すぐ submit_report で回答を提出してください。確認できなかった点は「窓口で確認」として consultations と assumptions に書いてください。";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "source"; tier: "条文" | "公的" | "参考"; title: string; url: string }
  | { type: "report_partial"; report: PartialReport }
  | { type: "report"; report: Report }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

const GetArticleInput = z.object({
  law: z.string().min(1),
  article: z.string().min(1),
});
const SearchLawsInput = z.object({ title: z.string().min(1) });
const KeywordInput = z.object({ keyword: z.string().min(1) });

const LAW_LIST = Object.values(LAWS)
  .map((l) => `${l.title}（${l.id}）`)
  .join("、");

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "get_law_article",
    description: `e-Gov 法令検索の現行条文を1条分取得します。法令名（正式名称または略称）または法令IDと、条番号を指定します。条番号は "43"、"6_4"（第6条の4）、"136_2_2"（第136条の2の2）の形式。登録済みの法令：${LAW_LIST}。未登録の法令は search_laws で法令IDを調べてから、law に法令IDを渡してください。`,
    input_schema: {
      type: "object",
      properties: {
        law: { type: "string", description: "法令名（例：建築基準法、建築基準法施行令、都市計画法）または法令ID（例：325AC0000000201）" },
        article: { type: "string", description: "条番号。例：43、6_4、56_2" },
      },
      required: ["law", "article"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "search_laws",
    description: "法令名の一部から e-Gov に登録された現行法令を検索し、法令IDと正式名称を返します。施行令・施行規則・条例ではない国の法令が対象です。",
    input_schema: {
      type: "object",
      properties: { title: { type: "string", description: "法令名の一部。例：宅地造成、浄化槽" } },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "search_law_text",
    description: "キーワードで全法令の本文を全文検索し、該当する法令と該当文を返します。どの法令に規定があるか分からないときに使います。",
    input_schema: {
      type: "object",
      properties: { keyword: { type: "string", description: "検索キーワード。例：住宅用防災機器、特定建設作業" } },
      required: ["keyword"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "submit_report",
    description:
      "調査が終わったら最後に1回だけ呼び、回答の全文をこの形式で提出します。本文を通常のテキストで書かず、必ずこのツールで提出してください。各項目の根拠には、取得した条文の e-Gov URL・公的資料の URL を入れます。",
    input_schema: REPORT_INPUT_SCHEMA as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  },
  { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4, max_content_tokens: 30000 },
];

export { sourceTier };

function resolveLaw(input: string): string | null {
  const key = lawByTitle(input);
  if (key) return LAWS[key as LawKey].id;
  if (/^\d{3}[A-Z]{2}\d{10}$/.test(input.trim())) return input.trim();
  return null;
}

function articleToText(a: Article): string {
  return [`${a.lawTitle}（${a.lawNum}）${a.label}${a.caption}`, `現行版：${a.revisionId}（施行日 ${a.enforcementDate ?? "不明"}）`, `URL：${a.url}`, "", a.text].join("\n");
}

async function runTool(name: string, input: unknown, emit: (e: AgentEvent) => void): Promise<{ content: string; isError?: boolean }> {
  if (name === "get_law_article") {
    const parsed = GetArticleInput.safeParse(input);
    if (!parsed.success) return { content: "INVALID_INPUT: law と article を指定してください", isError: true };
    const lawId = resolveLaw(parsed.data.law);
    if (!lawId) return { content: `法令「${parsed.data.law}」は未登録です。search_laws で法令IDを調べ、law に法令IDを渡してください。`, isError: true };
    const article = normalizeArticle(parsed.data.article);
    if (!article) return { content: `条番号「${parsed.data.article}」の形式が不正です。例：43、6_4`, isError: true };
    emit({ type: "tool", name, summary: `e-Gov 条文取得：${parsed.data.law} ${articleLabel(article)}` });
    try {
      const a = await fetchArticle(lawId, article);
      if (!a) return { content: `${parsed.data.law} に第${article}条（${article}）は見つかりませんでした。条番号を確認してください。`, isError: true };
      emit({ type: "source", tier: "条文", title: `${a.lawTitle} ${a.label}${a.caption}`, url: a.url });
      return { content: articleToText(a) };
    } catch (e) {
      return { content: `e-Gov API エラー：${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
  if (name === "search_laws") {
    const parsed = SearchLawsInput.safeParse(input);
    if (!parsed.success) return { content: "INVALID_INPUT", isError: true };
    emit({ type: "tool", name, summary: `e-Gov 法令検索：${parsed.data.title}` });
    try {
      const hits = await searchLaws(parsed.data.title);
      if (hits.length === 0) return { content: "該当する法令はありませんでした。" };
      return { content: hits.map((h) => `${h.title}｜法令ID ${h.lawId}｜${h.lawNum}｜${h.url}`).join("\n") };
    } catch (e) {
      return { content: `e-Gov API エラー：${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
  if (name === "search_law_text") {
    const parsed = KeywordInput.safeParse(input);
    if (!parsed.success) return { content: "INVALID_INPUT", isError: true };
    emit({ type: "tool", name, summary: `e-Gov 全文検索：${parsed.data.keyword}` });
    try {
      const hits = await keywordSearch(parsed.data.keyword);
      if (hits.length === 0) return { content: "該当はありませんでした。" };
      return {
        content: hits.map((h) => `■ ${h.title}（法令ID ${h.lawId}）${h.url}\n${h.sentences.map((s) => `　- ${s}`).join("\n")}`).join("\n\n"),
      };
    } catch (e) {
      return { content: `e-Gov API エラー：${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
  return { content: `unknown tool ${name}`, isError: true };
}

/** Pulls web sources out of server-tool result blocks so the UI can list them. */
function emitWebSources(content: Anthropic.Beta.BetaContentBlock[], emit: (e: AgentEvent) => void, seen: Set<string>) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result" && !seen.has(r.url)) {
          seen.add(r.url);
          emit({ type: "source", tier: sourceTier(r.url), title: r.title, url: r.url });
        }
      }
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const url = block.content.url;
      if (!seen.has(url)) {
        seen.add(url);
        const doc = block.content.content;
        const title = doc.type === "document" && "title" in doc && doc.title ? doc.title : url;
        emit({ type: "source", tier: sourceTier(url), title, url });
      }
    } else if (block.type === "server_tool_use" && (block.name === "web_search" || block.name === "web_fetch")) {
      const q = (block.input as { query?: string; url?: string }) ?? {};
      emit({ type: "tool", name: block.name, summary: block.name === "web_search" ? `Web検索：${q.query ?? ""}` : `Web取得：${q.url ?? ""}` });
    }
  }
}

export function buildUserMessage(plan: PlanInput, site: SiteContext | null): string {
  const merged = mergeSiteIntoPlan(plan, site);
  const findings = runRules(merged);
  return [
    planToText(merged),
    "",
    "# 住所から自動取得した土地の環境情報（【公的】国土地理院・国土交通省 不動産情報ライブラリ・農林水産省 筆ポリゴン）",
    siteToText(site),
    "",
    "# 土地のまとめ（画面に表示済み。データと条文の数値から自動算出）",
    site ? landFacts(merged, site).map((f) => `- ${f.label}：${f.value}${f.sub ? `（${f.sub}）` : ""}［${f.source}］`).join("\n") : "（住所未入力）",
    "",
    "# 事前チェック（ルールベース・条文照合済み。上記の自動取得結果を反映）",
    findingsToMarkdown(findings),
    "",
    USER_INSTRUCTION,
  ].join("\n");
}

/** Runs the agent and streams newline-delimited JSON events. */
export function consultStream(plan: PlanInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const client = new Anthropic();
      const seen = new Set<string>();
      let site: SiteContext | null = null;
      if (plan.address.trim()) {
        emit({ type: "status", text: `住所「${plan.address}」の位置・都市計画・災害区域を取得しています…` });
        try {
          site = await lookupSite(plan.address);
          for (const l of site.layers) {
            if (l.status === "hit" && !seen.has(l.source.url)) {
              seen.add(l.source.url);
              emit({ type: "source", tier: "公的", title: `${l.source.label}${l.source.year ? `（${l.source.year}）` : ""}`, url: l.source.url });
            }
          }
          for (const src of [site.farmland?.status === "ok" ? FUDE_SOURCE : null, site.water?.status === "ok" ? GSI_VT_SOURCE : null]) {
            if (src && !seen.has(src.url)) {
              seen.add(src.url);
              emit({ type: "source", tier: "公的", title: src.label, url: src.url });
            }
          }
          emit({ type: "status", text: site.matched ? `位置を特定：${site.matched}` : "住所から位置を特定できませんでした（手入力の値で続行）" });
        } catch (e) {
          emit({ type: "status", text: `土地情報の自動取得に失敗しました（${e instanceof Error ? e.message : "不明なエラー"}）。手入力の値で続行します。` });
        }
      }
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildUserMessage(plan, site) }];
      emit({ type: "status", text: "事前チェックを作成しました。条文と公的資料を確認しています…" });

      const started = Date.now();
      let wrapSent = false;
      let hardSent = false;
      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const elapsed = Date.now() - started;
          const last = messages[messages.length - 1];
          if (!wrapSent && elapsed > WRAP_UP_MS && last.role === "user") {
            messages.push({ role: "system", content: WRAP_UP_NOTE });
            wrapSent = true;
            emit({ type: "status", text: "調査を切り上げて、回答をまとめています…" });
          }
          if (wrapSent && !hardSent && elapsed > HARD_STOP_MS && last.role === "user") {
            messages.push({ role: "system", content: `時間の上限です。ツールは submit_report 以外使わず、直ちに提出してください。${WRAP_UP_NOTE}` });
            hardSent = true;
          }
          const stream = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 32000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "high" },
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            tools: TOOLS,
            messages,
          });
          stream.on("text", (delta) => emit({ type: "text", delta }));
          let lastPartial = 0;
          let announced = false;
          stream.on("inputJson", (_delta, snapshot) => {
            const block = stream.currentMessage?.content.at(-1);
            if (block?.type !== "tool_use" || block.name !== "submit_report") return;
            if (!announced) {
              announced = true;
              emit({ type: "status", text: "根拠が揃いました。回答をまとめています…" });
            }
            const now = Date.now();
            if (now - lastPartial < 700 || !snapshot || typeof snapshot !== "object") return;
            lastPartial = now;
            emit({ type: "report_partial", report: snapshot as PartialReport });
          });
          const message = await stream.finalMessage();

          emitWebSources(message.content, emit, seen);

          const submitted = message.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_report");
          if (submitted) {
            const parsed = reportSchema.safeParse(submitted.input);
            if (parsed.success) emit({ type: "report", report: parsed.data });
            else {
              console.error("report schema mismatch", parsed.error.issues.slice(0, 5));
              emit({ type: "report_partial", report: submitted.input as PartialReport });
            }
            emit({ type: "done", stopReason: message.stop_reason });
            controller.close();
            return;
          }

          if (message.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: message.content });
            continue;
          }
          if (message.stop_reason === "refusal") {
            emit({ type: "text", delta: "\n\n> この内容には回答できませんでした。入力内容を見直してください。" });
            break;
          }
          if (message.stop_reason === "max_tokens") {
            emit({ type: "text", delta: "\n\n> 文字数の上限に達したため途中で終了しました。計画を分けて再度お試しください。" });
            break;
          }
          const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
            emit({ type: "done", stopReason: message.stop_reason });
            controller.close();
            return;
          }

          messages.push({ role: "assistant", content: message.content });
          const results = await Promise.all(
            toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const r = await runTool(t.name, t.input, emit);
              return { type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError };
            }),
          );
          messages.push({ role: "user", content: results });
        }
        emit({ type: "done", stopReason: "end" });
      } catch (error) {
        console.error("consult failed", error);
        const message =
          error instanceof Anthropic.RateLimitError
            ? "現在混み合っています。少し時間をおいて再度お試しください。"
            : error instanceof Anthropic.AuthenticationError
              ? "APIキーが無効です（ANTHROPIC_API_KEY を確認してください）。"
              : error instanceof Anthropic.APIError
                ? `APIエラー（${error.status}）：${error.message}`
                : error instanceof Error && /ANTHROPIC_API_KEY|authentication method/i.test(error.message)
                  ? "APIキーが設定されていません。サーバーの環境変数 ANTHROPIC_API_KEY を設定してください（即時ルールチェックと条文表示はキーなしでも使えます）。"
                  : "処理中にエラーが発生しました。時間をおいて再度お試しください。";
        emit({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
}
