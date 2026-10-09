import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { checkCadence } from "@/lib/guard/schedule";

// Marketing copy must not promise a fixed hourly check: the interval grows with the total number of
// connections (lib/guard/schedule.ts). Short texts say "regular"; longer ones "hourly (less often at
// high load — see pricing)"; the FAQ and the pricing card use the tier table's own sentence.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const SOURCES: Record<string, string> = {
  "product.config (meta, OG, JSON-LD, llms.txt, landing, FAQ)": JSON.stringify(config),
  "bg/index.html": read("../../../bg/index.html"),
  "docs/lp.md": read("../docs/lp.md"),
  "docs/demo-video.md": read("../docs/demo-video.md"),
  "demo/index.html": read("../demo/index.html"),
};
const UNQUALIFIED = [/every hour/i, /hourly spend checks/i, /hourly poll/i, /polls hourly/i, /checked hourly(?! \(| —)/i, /the (next )?hourly check/i, /毎時チェック/, /1 ?時間ごとに(チェック|確認|取得)/];

describe("marketing copy: check frequency", () => {
  for (const [name, text] of Object.entries(SOURCES)) {
    it(`${name} makes no unqualified hourly promise`, () => {
      for (const re of UNQUALIFIED) expect(text, `${name}: ${re}`).not.toMatch(re);
    });
  }
  it("the FAQ answer uses the tier table's sentence", () => {
    const faq = config.landing.faq.find((f) => /fresh/i.test(f.q));
    expect(faq?.a).toContain(checkCadence());
  });
  it("the page description is short and makes no frequency promise", () => {
    expect(config.description).toMatch(/regularly checks/);
  });
});
