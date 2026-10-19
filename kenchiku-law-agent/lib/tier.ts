// Evidence tier from a URL: e-Gov statutes are 【条文】, government domains are
// 【公的】, everything else 【参考】. Shared by the agent and the UI.

export type Tier = "条文" | "公的" | "参考";

export function sourceTier(url: string): Tier {
  try {
    const host = new URL(url).hostname;
    if (host === "laws.e-gov.go.jp") return "条文";
    if (/\.(go|lg)\.jp$/.test(host) || /(^|\.)(pref|city|town|vill|metro)\.[a-z0-9-]+(\.[a-z0-9-]+)?\.jp$/.test(host) || host.endsWith("shoenehou-online.jp")) return "公的";
    // Municipal ordinance databases (例規集) hosted for the city by a vendor.
    if (host.endsWith("g-reiki.net") || /\.d1-law\.com$/.test(host)) return "公的";
  } catch {
    // not a URL
  }
  return "参考";
}
