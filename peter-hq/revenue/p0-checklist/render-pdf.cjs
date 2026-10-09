// checklist.html を A4 の PDF にする（Playwright の Chromium を使用）。
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright")); }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(__dirname, "checklist.html"));
  await p.pdf({ path: path.join(__dirname, "unei-shidou-checklist-jidou.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log("built unei-shidou-checklist-jidou.pdf");
})();
