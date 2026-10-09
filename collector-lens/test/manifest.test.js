const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const ALLOWED = ["page.auctions.yahoo.co.jp", "jp.mercari.com", "item.fril.jp", "order.mandarake.co.jp"];
const hostOf = (pattern) => pattern.replace(/^https:\/\//, "").split("/")[0];

test("Manifest V3 with only the storage permission", () => {
  assert.equal(m.manifest_version, 3);
  // "storage" saves the Estimated-total settings on the device (HQ 2026-10-09).
  assert.deepEqual(m.permissions, ["storage"]);
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

test("Firefox build settings are present and the content scripts use no chrome.* APIs except storage.local", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "store", "store.json"), "utf8"));
  assert.match(cfg.firefox.gecko_id, /^[a-z0-9.-]+@[a-z0-9.-]+$/);
  assert.ok(parseFloat(cfg.firefox.strict_min_version) >= 142, "AMO data_collection_permissions needs 140 desktop / 142 Android");
  // Firefox MV3 supports chrome.storage.local; nothing else from chrome.* is used.
  const ALLOWED_CHROME = ["chrome.storage", "chrome.storage.local", "chrome.storage.local.get", "chrome.storage.local.set"];
  for (const f of m.content_scripts.flatMap((c) => c.js)) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    const uses = (src.match(/\bchrome\.[A-Za-z_.]+/g) || []).map((u) => u.replace(/\.+$/, ""));
    if (f === "src/estimate-settings.js") {
      for (const u of uses) assert.ok(ALLOWED_CHROME.includes(u), `${f} uses ${u} (not portable)`);
    } else {
      assert.deepEqual(uses, [], `${f} uses chrome.* (not portable)`);
    }
  }
});

test("estimate scripts load before the overlay, rate tables before the engine", () => {
  const js = m.content_scripts.flatMap((c) => c.js);
  const at = (f) => js.indexOf(f);
  for (const f of ["src/rates-data.js", "src/landed-cost.js", "src/features.js", "src/estimate-settings.js", "src/estimate-section.js"]) {
    assert.ok(at(f) >= 0 && at(f) < at("src/overlay.js"), f);
  }
  assert.equal(js[js.length - 1], "src/content.js");
});
