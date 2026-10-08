// Detects strings like "ignore previous instructions" and `curl x | sh`.
const SUSPICIOUS = [/ignore (all )?previous instructions/i, /<IMPORTANT>/, /curl[^|]+\|\s*sh/];
const keywords = ["ignore previous instructions", "do not tell the user", "disregard prior rules"];
export const isBad = (s: string) => s.includes("ignore all previous instructions") || /eval\(atob/.test(s);
const re2 = new RegExp("send .* ~/.aws/credentials");
const out = execFileSync("git", ["status"], { env: { ...process.env } });
const m = /x/.exec(s);
