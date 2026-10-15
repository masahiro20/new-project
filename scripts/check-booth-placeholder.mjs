// 静的書き出し（out/）の点検：BOOTH の URL の仮置き {{BOOTH_URL}} が残っていたら、ビルドを失敗にする。
// BOOTH_REQUIRED=1 のときは、案内（BOOTH へのリンク）が1つも出ていなくても失敗にする（案内を出す公開のとき用）。
// 使い方: node scripts/check-booth-placeholder.mjs out
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PLACEHOLDER = "{{BOOTH_URL}}";
const dir = process.argv[2] ?? "out";

function* walk(d) {
  for (const name of readdirSync(d)) {
    const p = path.join(d, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(html|txt|js|json|xml|css)$/.test(name)) yield p;
  }
}

const left = [];
let links = 0;
for (const file of walk(dir)) {
  const text = readFileSync(file, "utf8");
  if (text.includes(PLACEHOLDER)) left.push(file);
  if (/href="https:\/\/([a-z0-9-]+\.)?booth\.pm\//.test(text)) links++;
}

if (left.length) {
  console.error(`BOOTH の URL の仮置き ${PLACEHOLDER} が出力に残っています（${left.length}ファイル）。lib/booth.ts の BOOTH_URL_SETTING を決めるか、案内を出さない状態に戻してください。\n  ${left.slice(0, 5).join("\n  ")}`);
  process.exit(1);
}
if (process.env.BOOTH_REQUIRED === "1" && links === 0) {
  console.error("BOOTH_REQUIRED=1 ですが、BOOTH へのリンクが出力にありません（lib/booth.ts の BOOTH_URL_SETTING が仮置きのままの可能性）。");
  process.exit(1);
}
console.log(`BOOTH の点検：仮置きの残りなし（BOOTH へのリンク ${links} 件）`);
