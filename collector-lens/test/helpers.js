const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SRC = ["glossary-data.js", "analyzer.js", "sites.js", "overlay.js"];

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

module.exports = { load, fixture };
