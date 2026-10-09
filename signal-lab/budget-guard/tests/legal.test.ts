import { afterEach, describe, expect, it, vi } from "vitest";
import { privacy } from "@/content/legal/privacy";
import { terms } from "@/content/legal/terms";
import { REVIEW_MARK } from "@/content/legal/types";
import { config } from "@/lib/config";
import { mergeLog, type LogEntry } from "@/lib/guard/store";
import { hostingProvider } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

const section = (doc: { sections: { heading: string; body: string[] }[] }, heading: string) => {
  const s = doc.sections.find((x) => x.heading === heading);
  if (!s) throw new Error(`missing section ${heading}`);
  return s.body.join("");
};
const all = (doc: { sections: { heading: string; body: string[] }[] }) => doc.sections.flatMap((s) => [s.heading, ...s.body]).join("\n");

describe("privacy policy names the actual host", () => {
  it("Cloudflare for build:cf, Vercel otherwise", () => {
    expect(hostingProvider({ BUDGET_GUARD_HOSTING: "cloudflare" })).toBe("Cloudflare");
    expect(hostingProvider({})).toBe("Vercel");
    vi.stubEnv("BUDGET_GUARD_HOSTING", "cloudflare");
    const ja = privacy.ja(config);
    const en = privacy.en(config);
    // The hosting line names only the real host. (Vercel still appears elsewhere, as a provider users can connect.)
    expect(ja.sections.find((s) => s.heading === "外部サービス")!.body[0]).toContain("ホスティングに Cloudflare");
    expect(en.sections.find((s) => s.heading === "Processors")!.body[0]).toContain("Cloudflare (hosting)");
    expect(ja.sections.find((s) => s.heading === "外部サービス")!.body[0] + en.sections.find((s) => s.heading === "Processors")!.body[0]).not.toContain("Vercel");
    expect(section(ja, "外国にある第三者への提供")).toContain("Cloudflare, Inc.（ホスティング）");
    expect(section(en, "International transfers")).toContain("Cloudflare, Inc. (hosting)");
    expect(section(ja, "外国にある第三者への提供") + section(en, "International transfers")).not.toContain("Vercel Inc.（ホスティング）");
  });

  it("names Vercel Inc. as host for Vercel builds", () => {
    vi.stubEnv("BUDGET_GUARD_HOSTING", "");
    expect(section(privacy.ja(config), "外国にある第三者への提供")).toContain("Vercel Inc.（ホスティング）");
    expect(section(privacy.en(config), "International transfers")).toContain("Vercel Inc. (hosting)");
  });
});

describe("privacy policy covers monitoring data (draft for expert review)", () => {
  const ja = privacy.ja(config);
  const en = privacy.en(config);

  it("lists tokens, Slack URL, Vercel webhook secret and spend data in both languages", () => {
    for (const word of ["API トークン", "Slack の incoming webhook", "Vercel の Spend Management webhook の秘密", "スナップショット", "アクティビティログ"]) {
      expect(section(ja, "取得する情報")).toContain(word);
    }
    for (const word of ["API tokens", "Slack incoming webhook URL", "Vercel Spend Management webhook secret", "snapshot", "activity log"]) {
      expect(section(en, "What we collect")).toContain(word);
    }
  });

  it("retention matches the code: 50 log entries, token deleted with the connection, AES-256-GCM", () => {
    const entries: LogEntry[] = Array.from({ length: 60 }, (_, i) => ({ kind: "info", connectionId: "c", message: String(i), at: "" }));
    expect(mergeLog([], entries)).toHaveLength(50);
    expect(section(ja, "保存期間と削除")).toContain("最新の50件");
    expect(section(en, "Retention and deletion")).toContain("latest 50 entries");
    expect(section(ja, "保存期間と削除")).toContain("接続を削除すると、トークン");
    expect(section(en, "Retention and deletion")).toContain("Deleting a connection deletes its token");
    expect(section(ja, "暗号化と安全管理")).toContain("AES-256-GCM");
    expect(section(en, "Encryption and security")).toContain("AES-256-GCM");
  });

  it("gives the three items 施行規則17条2項 asks for, per recipient", () => {
    const jaT = section(ja, "外国にある第三者への提供");
    const enT = section(en, "International transfers");
    expect(jaT).toContain("https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/");
    expect(enT).toContain("https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/");
    for (const name of ["Upstash, Inc.", "Plus Five Five, Inc.", "Stripe", "Slack Technologies Limited", "Anthropic PBC", "OpenAI OpCo, LLC"]) {
      expect(jaT).toContain(name);
      expect(enT).toContain(name);
    }
    expect(jaT).toContain("デプロイ時に選んだリージョン");
    expect(enT).toContain("region we chose when deploying");
  });
});

describe("terms of service drafts", () => {
  const ja = terms.ja(config);
  const en = terms.en(config);

  it("stop actions are best effort, with the documented reasons", () => {
    const jaS = section(ja, "停止アクションの性質");
    const enS = section(en, "Nature of stop actions");
    expect(jaS).toContain("ベストエフォート");
    expect(enS).toContain("best-effort");
    for (const fact of ["日単位", "毎時", "最長12時間", "即時には効かず"]) expect(jaS).toContain(fact);
    for (const fact of ["per day", "every hour", "up to 12 hours", "not instantaneous"]) expect(enS).toContain(fact);
  });

  it("business use, with separate business and consumer liability clauses", () => {
    expect(section(ja, "対象となる利用者")).toContain("業務での利用");
    expect(section(en, "Who the Service is for")).toContain("business purposes");
    const jaB = section(ja, "責任の制限（事業者の利用者）");
    const jaC = section(ja, "責任の制限（消費者の利用者）");
    const enB = section(en, "Limitation of liability (business users)");
    const enC = section(en, "Limitation of liability (consumers)");
    expect(all(ja)).not.toMatch(/一切(の)?責任を負(わ|い)/);
    expect(all(en).toLowerCase()).not.toMatch(/no liability|not liable for any|in no event/);
    for (const s of [jaB, jaC]) {
      expect(s).toContain("故意または重大な過失");
      expect(s).toContain("12か月");
    }
    for (const s of [enB, enC]) {
      expect(s).toContain("willful misconduct or gross negligence");
      expect(s).toContain("12 months");
    }
    // Consumers: only slight negligence is capped (消契法8条3項), and the cap never drops to zero (8条1項).
    expect(jaC).toContain("重大な過失を除きます");
    expect(jaC).toContain("いずれか高い額");
    expect(jaC).toContain("無償の試用・デモ");
    expect(enC).toContain("other than gross negligence");
    expect(enC).toContain("the higher of");
    expect(enC).toContain("where you have paid no fees");
    // English uses a general limitation-of-liability clause, without the Japanese statute.
    expect(all(en)).not.toMatch(/Consumer Contract Act/);
  });

  it("demo and trial conditions", () => {
    const jaD = section(ja, "デモと試用");
    const enD = section(en, "Demo and trial");
    for (const fact of ["料金は請求されず", "試用の期間は30日間", "終了から30日間保存", "7日以内", "テストモードで始まります", "捨ててよいプロジェクト", "live"]) expect(jaD).toContain(fact);
    for (const fact of ["not charged", "trial period is 30 days", "30 days after the end", "within 7 days", "starts in test mode", "throwaway project", "live"]) expect(enD).toContain(fact);
  });
});

describe("decided values replace the open questions", () => {
  it("retention 30 days after the end, deletion within 7 days, consent for cross-border transfers", () => {
    const ja = privacy.ja(config);
    const en = privacy.en(config);
    expect(section(ja, "保存期間と削除")).toContain("終了から30日間保存");
    expect(section(ja, "保存期間と削除")).toContain("ご依頼から7日以内");
    expect(section(en, "Retention and deletion")).toContain("30 days after the end");
    expect(section(en, "Retention and deletion")).toContain("within 7 days of your request");
    expect(section(ja, "外国にある第三者への提供")).toContain("本人の同意を得たうえで");
    expect(section(en, "International transfers")).toContain("prior consent");
    const decided = /試用の期間は（要確認）|保存期間は（要確認）|（要確認）日以内|trial period is to be confirmed|within \(to be confirmed\) days/;
    for (const d of [ja, en, terms.ja(config), terms.en(config)]) expect(all(d)).not.toMatch(decided);
  });
});

describe("review marks and language parity", () => {
  for (const [name, doc] of [["privacy", privacy], ["terms", terms]] as const) {
    it(`${name}: ja and en have the same shape and the same review marks`, () => {
      const ja = doc.ja(config);
      const en = doc.en(config);
      expect(en.sections.map((s) => s.body.length)).toEqual(ja.sections.map((s) => s.body.length));
      const marks = (d: typeof ja) => d.sections.map((s) => s.body.map((p) => p.startsWith(REVIEW_MARK)));
      expect(marks(en)).toEqual(marks(ja));
      expect(all(ja)).toContain(REVIEW_MARK);
    });

    it(`${name}: paragraphs are unique (they are React keys) and 【要記入】 is not added here`, () => {
      for (const d of [doc.ja(config), doc.en(config)]) {
        expect(new Set(d.sections.map((s) => s.heading)).size).toBe(d.sections.length);
        for (const s of d.sections) expect(new Set(s.body).size).toBe(s.body.length);
        const own = d.sections.filter((s) => !s.body.some((p) => p.includes(config.legal.sellerName))).flatMap((s) => s.body).join("");
        expect(own).not.toContain("【要記入");
      }
    });
  }
});
