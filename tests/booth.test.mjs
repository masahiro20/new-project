import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BOOTH_URL_PLACEHOLDER, BOOTH_URL_SETTING, boothReady, boothUrl } from "../lib/booth.ts";

test("BOOTH の URL は、決まるまで仮置きで、案内は出ない", () => {
  assert.equal(BOOTH_URL_SETTING, BOOTH_URL_PLACEHOLDER);
  assert.equal(boothUrl(undefined), BOOTH_URL_PLACEHOLDER);
  assert.equal(boothReady(BOOTH_URL_PLACEHOLDER), false);
  assert.equal(boothReady(boothUrl(" ")), false);
});

test("本物の BOOTH の URL だけが案内を出す", () => {
  assert.equal(boothReady("https://hilfecreate.booth.pm/items/1234567"), true);
  assert.equal(boothReady("https://booth.pm/ja/items/1234567"), true);
  assert.equal(boothUrl("https://hilfecreate.booth.pm/items/1"), "https://hilfecreate.booth.pm/items/1");
  for (const bad of ["http://booth.pm/items/1", "https://evilbooth.pm/items/1", "https://booth.pm.evil.example/items/1", "javascript:alert(1)", "booth.pm/items/1", "", "{{BOOTH_URL}}"]) {
    assert.equal(boothReady(bad), false, bad);
  }
});

function check(files, env = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "booth-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), text);
    }
    return spawnSync("node", ["scripts/check-booth-placeholder.mjs", dir], { encoding: "utf8", env: { ...process.env, BOOTH_REQUIRED: "", ...env } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("出力に {{BOOTH_URL}} が残っていたら、点検が失敗する", () => {
  assert.equal(check({ "guide/a/index.html": "<a href=\"{{BOOTH_URL}}\">x</a>" }).status, 1);
  assert.equal(check({ "_next/static/a.js": "var u=\"{{BOOTH_URL}}\"" }).status, 1);
  assert.equal(check({ "index.html": "<p>案内なし</p>" }).status, 0);
});

test("BOOTH_REQUIRED=1 のときは、BOOTH へのリンクが無くても失敗する", () => {
  assert.equal(check({ "index.html": "<p>案内なし</p>" }, { BOOTH_REQUIRED: "1" }).status, 1);
  assert.equal(check({ "index.html": "<a href=\"https://hilfecreate.booth.pm/items/1\">x</a>" }, { BOOTH_REQUIRED: "1" }).status, 0);
});
