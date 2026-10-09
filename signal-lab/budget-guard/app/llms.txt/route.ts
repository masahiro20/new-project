import { config, formatAmount } from "@/lib/config";
import { siteUrl } from "@/lib/site";

// llms.txt: a plain-text map of the site for AI assistants and AI search crawlers.
export const dynamic = "force-static";

export function GET() {
  const base = siteUrl();
  const plans = config.pricing.plans
    .map((p) => (p.comingSoon ? `- ${p.label}: coming soon (not for sale yet)` : `- ${p.label}: ${formatAmount(p.amount)}${p.interval ? ` / ${p.interval}` : ""}`))
    .join("\n");
  const body = `# ${config.name}

> ${config.tagline} ${config.description}

## Pages
- [${config.name}](${base}/): overview
- [Pricing](${base}/pricing)
- [特定商取引法に基づく表記](${base}/legal/tokushoho)

## Pricing
${plans}

## Features
${config.landing.features.map((f) => `- ${f.title}: ${f.body}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
