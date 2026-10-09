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

test("result link round-trips and rejects junk", async () => {
  const { encodeResult, decodeResult } = await import("../lib/check.ts");
  const answers = [true, false, true, true, false, false, false, false, true, false, false, true, true];
  const hash = "#" + encodeResult(0, answers);
  const r = decodeResult(hash);
  assert.equal(r.serviceIndex, 0);
  answers.forEach((on, i) => assert.equal(r.checked(i), on));
  assert.equal(decodeResult("#r=999-1"), null);
  assert.equal(decodeResult("#other"), null);
});

test("every template fix covers items of its own group", async () => {
  const { templatesFor } = await import("../lib/check.ts");
  for (const s of CHECK_SERVICES)
    for (const g of checkGroups(s)) for (const t of g.templates ?? []) for (const c of t.covers) assert.ok(g.items.includes(c), c);
  const abuse = checkGroups(byLabel("放課後等デイサービス")).find((g) => g.id === "abuse");
  assert.deepEqual(templatesFor(abuse, ["直近1年以内に虐待防止研修を実施し、記録がある"]), ["training"]);
  assert.deepEqual(templatesFor(abuse, abuse.items), ["committee", "training"]);
  assert.deepEqual(templatesFor(abuse, []), []);
});

test("template links preselect the service and the template", async () => {
  const { templateHref } = await import("../lib/check.ts");
  const href = templateHref(byLabel("共同生活援助"), "restraint");
  const params = new URLSearchParams(href.split("#")[1]);
  assert.equal(params.get("s"), "共同生活援助（グループホーム）");
  assert.equal(params.get("p"), "restraint");
});

test("a saved draft is restored only with known answers", async () => {
  const { parseDraft } = await import("../lib/check.ts");
  const key = `虐待防止措置:${checkGroups(CHECK_SERVICES[0])[0].items[0]}`;
  assert.deepEqual(parseDraft(JSON.stringify({ serviceIndex: 0, checked: [key, "junk", 3] })), { serviceIndex: 0, checked: [key] });
  assert.equal(parseDraft(JSON.stringify({ serviceIndex: 999, checked: [] })), null);
  assert.equal(parseDraft("{bad"), null);
  assert.equal(parseDraft(null), null);
});
