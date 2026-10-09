// Provider error bodies end up in emails, Slack, the dashboard log and server logs.
// Strip anything that looks like a credential before they leave the provider call.
const PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9_*-]{6,})/g, // OpenAI / Anthropic keys (incl. provider-masked forms)
  /\b(bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi,
  /("?(?:token|api[_-]?key|authorization|secret)"?\s*[:=]\s*"?)[^"\s,}]{6,}/gi,
];

export function redactSecrets(text: string): string {
  return PATTERNS.reduce((s, re) => s.replace(re, (_m, keep: string) => (keep.startsWith("sk-") ? "sk-[redacted]" : `${keep}[redacted]`)), text);
}
