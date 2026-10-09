import { afterEach, describe, expect, it, vi } from "vitest";
import { privacy } from "@/content/legal/privacy";
import { config } from "@/lib/config";
import { hostingProvider } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("privacy policy names the actual host", () => {
  it("Cloudflare for build:cf, Vercel otherwise", () => {
    expect(hostingProvider({ BUDGET_GUARD_HOSTING: "cloudflare" })).toBe("Cloudflare");
    expect(hostingProvider({})).toBe("Vercel");
    vi.stubEnv("BUDGET_GUARD_HOSTING", "cloudflare");
    const ja = privacy.ja(config).sections.find((s) => s.heading === "外部サービス")!.body.join("");
    const en = privacy.en(config).sections.find((s) => s.heading === "Processors")!.body.join("");
    expect(ja).toContain("ホスティングに Cloudflare");
    expect(en).toContain("Cloudflare (hosting)");
    expect(ja + en).not.toContain("Vercel");
  });
});
