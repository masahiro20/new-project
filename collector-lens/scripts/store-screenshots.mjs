// Renders Chrome Web Store image assets for the provisional store name "Tanuki Scout".
//
//   node scripts/store-screenshots.mjs
//
// Output:
//   store/screenshots/01-*.png .. 03-*.png   1280x800, 24-bit RGB (no alpha)
//   store/promo-small-440x280.png             440x280, 24-bit RGB (no alpha)
//
// Every screenshot shows a hand-written MOCK listing page from test/fixtures/
// (not a real Yahoo! Auctions / Rakuma page) with the extension's own overlay
// drawn on top. A small "Mock listing page" label is added to each shot.
//
// Offline by design: each fixture is served via page.route() under the fake
// listing URL the content script expects, and EVERY other request is aborted,
// so nothing goes out to the network.
//
// Playwright is not a repo dependency. It is loaded from:
//   PLAYWRIGHT_PATH  env var: a node_modules dir containing `playwright`
//                    (or a direct path to the playwright package directory)
//   default:         /tmp/claude-0/-home-user-new-project/0d2a333f-67e8-518a-9336-e60024608f7a/scratchpad/qa/node_modules
// Chromium comes from PLAYWRIGHT_BROWSERS_PATH as usual (do not run `playwright install`).
// If Playwright's expected browser build is missing (version mismatch), set
//   CHROMIUM_PATH    path to a chrome/headless_shell executable; otherwise the
//                    script falls back to the newest $PLAYWRIGHT_BROWSERS_PATH/chromium-*/chrome-linux/chrome.
//
// The store name only replaces the overlay footer text in memory; src/ is not modified.
// Alpha is stripped with python3 + PIL if the PNG has an alpha channel.
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const DEFAULT_PW = "/tmp/claude-0/-home-user-new-project/0d2a333f-67e8-518a-9336-e60024608f7a/scratchpad/qa/node_modules";
function loadPlaywright() {
  const base = process.env.PLAYWRIGHT_PATH || DEFAULT_PW;
  const req = createRequire(join(base, "noop.js"));
  try { return req("playwright"); } catch (e) {
    try { return req(base); } catch { throw new Error(`Cannot load playwright from ${base} (set PLAYWRIGHT_PATH): ${e.message}`); }
  }
}
const { chromium } = loadPlaywright();

const NAME = "Tanuki Scout";
const TAGLINE = "Read the Japanese fine print before you bid.";

const SHOTS = [
  { out: "01-yahoo-camera-junk.png", fixture: "yahoo-camera-junk.html", url: "https://page.auctions.yahoo.co.jp/jp/auction/x000000001" },
  { out: "02-rakuma-watch-fake.png", fixture: "rakuma-watch-fake.html", url: "https://item.fril.jp/mock00000000000001" },
  { out: "03-yahoo-watch-shop.png", fixture: "yahoo-watch-shop.html", url: "https://page.auctions.yahoo.co.jp/jp/auction/x000000002" }
];

const SRC = ["src/glossary-data.js", "src/analyzer.js", "src/sites.js", "src/overlay.js", "src/content.js"];
const FOOTER_OLD = "Tanuki Scout (prototype) · ";
const sources = SRC.map((f) => {
  let s = read(f);
  if (f.endsWith("overlay.js")) {
    if (!s.includes(FOOTER_OLD)) throw new Error("overlay.js footer text not found; update FOOTER_OLD");
    s = s.split(FOOTER_OLD).join(NAME + " · ");
  }
  return s;
});

// Light page chrome for the bare mock fixtures + a visible "mock" label.
const PAGE_CSS = `
  body{margin:0;padding:52px 48px 32px;font:15px/1.7 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans CJK JP",sans-serif;color:#222;background:#fafaf7}
  main{max-width:680px}
  h1{font-size:22px;line-height:1.5;margin:28px 0 16px}
  dt{font-weight:600;color:#555} dd{margin:0 0 8px 0}
  th,td{text-align:left;padding:4px 12px 4px 0;vertical-align:top}
  #ts-mock-label{position:fixed;top:12px;left:48px;font:600 12px/1 system-ui,sans-serif;letter-spacing:.04em;color:#6b6b6b;background:#ececE6;border:1px solid #d8d8d0;border-radius:4px;padding:6px 8px}
`;

const outDir = join(root, "store/screenshots");
mkdirSync(outDir, { recursive: true });

function stripAlpha(file) {
  const py = `
import sys
from PIL import Image
p = sys.argv[1]; w = int(sys.argv[2]); h = int(sys.argv[3])
im = Image.open(p)
if im.mode != "RGB":
    bg = Image.new("RGB", im.size, (255, 255, 255))
    rgba = im.convert("RGBA")
    bg.paste(rgba, mask=rgba.split()[3])
    bg.save(p, "PNG")
im = Image.open(p)
assert im.size == (w, h), f"{p}: size {im.size} != {(w, h)}"
assert im.mode == "RGB", f"{p}: mode {im.mode}"
print(f"{p}: {im.size[0]}x{im.size[1]} {im.mode}")
`;
  return (w, h) => process.stdout.write(execFileSync("python3", ["-I", "-c", py, file, String(w), String(h)], { encoding: "utf8" }));
}

import { readdirSync } from "node:fs";
async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try { return await chromium.launch(); } catch (e) {
    const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
    const cands = (existsSync(dir) ? readdirSync(dir) : []).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
      .map((d) => join(dir, d, "chrome-linux", "chrome")).filter(existsSync);
    if (!cands.length) throw e;
    console.log(`(default browser build missing; using ${cands[0]})`);
    return chromium.launch({ executablePath: cands[0] });
  }
}
const browser = await launch();
try {
  for (const shot of SHOTS) {
    const fx = join(root, "test/fixtures", shot.fixture);
    if (!existsSync(fx)) throw new Error(`missing fixture ${shot.fixture}`);
    const html = readFileSync(fx, "utf8");
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "ja-JP" });
    let blocked = 0;
    await context.route("**/*", (route) => {
      if (route.request().url() === shot.url) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      blocked++;
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(shot.url, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: PAGE_CSS });
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.id = "ts-mock-label";
      d.textContent = "Mock listing page for illustration — not a real site";
      document.body.appendChild(d);
    });
    for (const content of sources) await page.addScriptTag({ content });
    await page.waitForSelector("#" + (await page.evaluate(() => globalThis.CollectorLens.OVERLAY_HOST_ID)), { state: "attached", timeout: 5000 });
    await page.waitForTimeout(300);
    const file = join(outDir, shot.out);
    await page.screenshot({ path: file, type: "png", omitBackground: false });
    stripAlpha(file)(1280, 800);
    if (blocked) console.log(`  (${blocked} non-fixture request(s) aborted)`);
    await context.close();
  }

  // Small promo tile, 440x280.
  const promo = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    html,body{margin:0;width:440px;height:280px;overflow:hidden}
    body{background:#f6f1e7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f3a93;position:relative}
    .band{position:absolute;left:0;top:0;bottom:0;width:192px;background:#1f3a93;color:#f6f1e7;padding:30px 22px}
    .name{font-size:29px;font-weight:700;letter-spacing:-.01em;line-height:1.1}
    .tag{margin-top:14px;font-size:15px;line-height:1.4;color:#dfe4f3}
    .mock{position:absolute;left:22px;bottom:16px;font-size:10px;color:#aab6dc}
    .panel{position:absolute;right:18px;top:30px;width:214px;background:#fff;border:1px solid #d9d3c4;border-radius:10px;box-shadow:0 6px 18px rgba(31,58,147,.14);overflow:hidden}
    .ph{background:#eef1f9;padding:8px 11px;font-size:11px;font-weight:700;color:#1f3a93;border-bottom:1px solid #e3e6ef}
    ul{list-style:none;margin:0;padding:6px 0}
    li{display:flex;align-items:center;gap:8px;padding:6px 11px;font-size:13px;line-height:1.25;color:#222;font-weight:600;white-space:nowrap}
    li i{flex:none;width:9px;height:9px;border-radius:50%}
    li span{font-weight:400;color:#777;font-size:10.5px;display:block}
    .r{border-left:3px solid #c62828} .r i{background:#c62828}
    .a{border-left:3px solid #d99a00} .a i{background:#d99a00}
    .t{border-left:3px solid #00897b} .t i{background:#00897b}
    .pf{padding:6px 11px 8px;font-size:9.5px;color:#888;border-top:1px solid #eee}
  </style></head><body>
    <div class="band"><div class="name">${NAME}</div><div class="tag">${TAGLINE}</div><div class="mock">Illustration · mock listing</div></div>
    <div class="panel"><div class="ph">Listing notes</div><ul>
      <li class="r"><i></i><div>Junk — sold as-is<span>ジャンク</span></div></li>
      <li class="a"><i></i><div>Haze<span>クモリ</span></div></li>
      <li class="t"><i></i><div>No fungus (stated)<span>カビなし</span></div></li>
    </ul><div class="pf">Rule-based notes · not an appraisal</div></div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await ctx.route("**/*", (r) => r.abort());
  const p = await ctx.newPage();
  await p.setContent(promo, { waitUntil: "load" });
  const promoFile = join(root, "store/promo-small-440x280.png");
  await p.screenshot({ path: promoFile, type: "png", omitBackground: false });
  stripAlpha(promoFile)(440, 280);
  await ctx.close();
} finally {
  await browser.close();
}
