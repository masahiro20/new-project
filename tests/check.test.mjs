import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_SERVICES, checkGroups } from "../lib/check.ts";

const byLabel = (prefix) => CHECK_SERVICES.find((s) => s.label.startsWith(prefix));
const ids = (prefix) => checkGroups(byLabel(prefix)).map((g) => g.id);
const risk = (prefix, id) => checkGroups(byLabel(prefix)).find((g) => g.id === id).risk;

test("restraint is not checked for consultation services", () => {
  assert.ok(!ids("計画相談支援").includes("restraint"));
  assert.ok(!ids("自立生活援助").includes("restraint"));
  assert.ok(ids("放課後等デイサービス").includes("restraint"));
});

test("rates follow the residential / other split", () => {
  assert.match(risk("共同生活援助", "restraint"), /10%/);
  assert.match(risk("短期入所", "restraint"), /所定単位数の1%/);
  assert.match(risk("共同生活援助", "bcp"), /3%/);
  assert.match(risk("就労継続支援B型", "disclosure"), /5%/);
  assert.match(risk("その他", "restraint"), /施設・居住系10%、その他1%/);
});

test("child day services also check the publication duties", () => {
  assert.ok(ids("放課後等デイサービス").includes("child"));
  assert.ok(ids("児童発達支援").includes("child"));
  assert.ok(!ids("生活介護").includes("child"));
});

test("items use the 1-year rule, not the fiscal year", () => {
  for (const s of CHECK_SERVICES) for (const g of checkGroups(s)) for (const i of g.items) assert.ok(!i.includes("今年度"), i);
});
