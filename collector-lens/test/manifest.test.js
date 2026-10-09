const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const ALLOWED = ["page.auctions.yahoo.co.jp", "jp.mercari.com", "item.fril.jp", "order.mandarake.co.jp"];
const hostOf = (pattern) => pattern.replace(/^https:\/\//, "").split("/")[0];

test("Manifest V3 with no API permissions", () => {
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, []);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.background, undefined);
  assert.equal(m.web_accessible_resources, undefined);
  assert.equal(m.externally_connectable, undefined);
});

test("host access limited to the four target domains over https", () => {
  const patterns = [...m.host_permissions, ...m.content_scripts.flatMap((c) => c.matches)];
  for (const p of patterns) {
    assert.match(p, /^https:\/\//, p);
    assert.ok(ALLOWED.includes(hostOf(p)), p);
    assert.ok(!hostOf(p).includes("*"), "no wildcard hosts: " + p);
  }
});

test("name stays a working title", () => {
  assert.match(m.name, /prototype/i);
});

test("every content script file exists", () => {
  for (const f of m.content_scripts.flatMap((c) => c.js)) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f);
  }
  for (const f of Object.values(m.icons)) assert.ok(fs.existsSync(path.join(__dirname, "..", f)), f);
});

test("store build settings fit Chrome Web Store limits", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "store", "store.json"), "utf8"));
  assert.ok(cfg.name.length <= 75, "name");
  assert.ok(cfg.short_name.length <= 12, "short_name");
  assert.ok(cfg.description.length <= 132, "description");
  assert.match(cfg.version, /^\d+\.\d+\.\d+$/);
  // The repo manifest keeps the working title; only the store build is renamed.
  assert.match(m.name, /prototype/i);
});
