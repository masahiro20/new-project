#!/usr/bin/env node
// Builds timeline/today.json for the office's 「今日のタイムライン」 from git log (all remote branches).
// Picks, for one Tokyo day: site republishes (gh-pages), security reviews, and QA reports/fixes.
// Decisions (approvals.decidedAt) and the nightly report are merged in by the page from the db.
//   node peter-hq/office/build-timeline.mjs <out-dir> [YYYY-MM-DD]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] || ".";
const day = process.argv[3] || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const since = new Date(day + "T00:00:00+09:00").toISOString();
const until = new Date(new Date(day + "T00:00:00+09:00").getTime() + 864e5).toISOString();
const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
const branches = git("branch", "-r", "--format=%(refname:short)").split("\n").map((s) => s.trim()).filter((b) => b && !b.endsWith("/HEAD"));
const seen = new Map();
for (const b of branches) {
  const log = git("log", b, `--since=${since}`, `--until=${until}`, "--format=%H%x1f%cI%x1f%s");
  for (const line of log.split("\n").filter(Boolean)) {
    const [hash, at, subject] = line.split("\x1f");
    if (!seen.has(hash)) seen.set(hash, { hash, at, subject, branch: b.replace(/^origin\//, "") });
  }
}
const items = [];
for (const c of seen.values()) {
  let kind = null;
  if (c.branch === "gh-pages") kind = "publish";
  else if (/セキュリティ|security|脆弱/i.test(c.subject) && c.branch !== "peter/hq-office") kind = "security";
  else if (/\bQA\b/.test(c.subject) && c.branch !== "peter/hq-office") kind = "qa";
  if (kind) items.push({ kind, at: c.at, title: c.subject, branch: c.branch, commit: c.hash.slice(0, 7), url: `https://github.com/masahiro20/new-project/commit/${c.hash}` });
}
items.sort((a, b) => a.at.localeCompare(b.at));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "today.json"), JSON.stringify({ day, builtAt: new Date().toISOString(), items }, null, 1));
console.log(`${day}: ${items.length} items (${["publish", "security", "qa"].map((k) => k + " " + items.filter((i) => i.kind === k).length).join(", ")})`);
