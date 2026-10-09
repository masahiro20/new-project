const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

// Every content script except the entry point (content.js), in manifest order.
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const SRC = MANIFEST.content_scripts.flatMap((c) => c.js)
  .filter((f) => f !== "src/content.js")
  .map((f) => f.replace(/^src\//, ""));

// Load the content-script modules into a single namespace, as Chrome would.
function load() {
  for (const f of SRC) delete require.cache[require.resolve(path.join("..", "src", f))];
  let ns;
  for (const f of SRC) ns = require(path.join("..", "src", f));
  return ns;
}

function fixture(name, url) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return new JSDOM(html, { url });
}

module.exports = { load, fixture, SRC };
