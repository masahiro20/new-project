const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const CL = load();
const index = CL.buildIndex(CL.GLOSSARY);
const run = (listing) => CL.analyze(listing, null, index);
const ids = (arr) => arr.map((x) => x.id);
const termFlags = (r) => ids(r.flags).filter((id) => !id.startsWith("rule:"));

test("full-width / half-width variants normalize to the same terms", () => {
  const a = CL.findTerms("ｼﾞｬﾝｸ品 ＯＨ済み", index).map((h) => h.entry.id);
  assert.deepEqual(a, ["junk", "oh_done"]);
});

test("longest match wins: 動作未確認 is not also read as 未確認", () => {
  const hits = CL.findTerms("動作未確認です", index).map((h) => h.entry.id);
  assert.deepEqual(hits, ["dousa_mikakunin"]);
});

test("negated defects become reassurances, not warnings", () => {
  const r = run({ title: "レンズ", description: "カビ、くもり、バルサム切れなし。" });
  assert.deepEqual(termFlags(r), []);
  assert.deepEqual(ids(r.reassurances).sort(), ["balsam", "kabi", "kumori"]);
});

test("ありません negates even though it starts with あり", () => {
  const r = run({ title: "レンズ", description: "カビはありません。" });
  assert.deepEqual(termFlags(r), []);
  assert.deepEqual(ids(r.reassurances), ["kabi"]);
});

test("affirmed defect before a negated one stays a warning", () => {
  const r = run({ title: "レンズ", description: "カビあり、くもりなし。" });
  assert.deepEqual(termFlags(r), ["kabi"]);
  assert.deepEqual(ids(r.reassurances), ["kumori"]);
});

test("少ない is not a negator", () => {
  const r = run({ title: "レンズ", description: "チリ混入は少ないです。" });
  assert.deepEqual(termFlags(r), ["dust"]);
});

test("negation does not cross a sentence boundary", () => {
  const r = run({ title: "レンズ", description: "カビがあります。くもりはなし。" });
  assert.ok(ids(r.flags).includes("kabi"));
});

test("condition and return terms are never negated", () => {
  const r = run({ title: "カメラ", description: "ジャンク扱いですが、返品はできないのでご了承ください。" });
  assert.ok(ids(r.flags).includes("junk"));
});

test("日差 (daily rate) is not matched inside 日差し (sunlight)", () => {
  assert.deepEqual(CL.findTerms("日差しの強い部屋で保管", index).map((h) => h.entry.id), []);
  assert.deepEqual(CL.findTerms("日差+5秒", index).map((h) => h.entry.id), ["nissa"]);
});

test("short ASCII forms only match whole words", () => {
  assert.deepEqual(CL.findTerms("GPS内蔵 BOSS", index).map((h) => h.entry.id), []);
  assert.deepEqual(CL.findTerms("ケース: SS / 18K", index).map((h) => h.entry.id), ["ss", "k18"]);
});

test("genre detection", () => {
  assert.equal(CL.detectGenre("Nikon F 一眼レフ 50mm F1.4"), "camera");
  assert.equal(CL.detectGenre("セイコー 自動巻き 腕時計"), "watch");
  assert.equal(CL.detectGenre("ぬいぐるみ"), "general");
});

test("neutral terms outside the item's genre are hidden", () => {
  // ダイヤル is a watch-dial entry; on a camera it means a control dial.
  const r = run({ title: "Nikon 一眼レフ カメラ", description: "シャッターダイヤル正常。ダイヤル操作OK。" });
  assert.ok(!ids(r.terms).includes("dial"));
});

test("rule: untested + no returns", () => {
  const r = run({ title: "カメラ", description: "動作未確認。ノークレームノーリターンで。" });
  assert.equal(r.flags[0].risk, "high");
  assert.ok(ids(r.flags).includes("rule:no_return_and_untested"));
  assert.equal(r.score.level, "high");
});

test("rule: authenticity disclaimer on a watch", () => {
  const r = run({ title: "腕時計 クオーツ", description: "頂き物のため真贋不明です。腕時計として使えます。" });
  assert.ok(ids(r.flags).includes("rule:authenticity_disclaimer_luxury"));
});

test("rule: very short description", () => {
  const r = run({ title: "時計", description: "写真の物です。" });
  assert.ok(ids(r.flags).includes("rule:minimal_description"));
});

test("shop and exporter grades", () => {
  const shop = CL.findRanks("ランク：AB 中古品");
  assert.equal(shop[0].label, "AB");
  const exp = CL.findRanks("Condition: Exc+++ / Nikon");
  assert.ok(exp.some((r) => r.kind === "export" && /Exc\+\+\+/.test(r.label)));
  assert.equal(CL.findRanks("状態は良好です").length, 0);
  assert.equal(CL.findRanks("EXIF付き").length, 0);
});

test("bare grade in the condition field is read as a shop rank", () => {
  const r = run({ title: "二眼レフ", description: "", condition: "B" });
  assert.equal(r.ranks[0].label, "B");
});

test("clean listing gets no high-level score", () => {
  const r = run({ title: "単焦点レンズ 35mm", description: "光学系はカビ、くもりなし。動作確認済みです。外観は使用に伴うスレ程度で、前後キャップが付属します。" });
  assert.notEqual(r.score.level, "high");
  assert.ok(ids(r.reassurances).includes("dousa_kakunin_zumi"));
});
