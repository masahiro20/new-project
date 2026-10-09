// Lens / film-camera categories: subgenre detection and the new dictionary entries.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const CL = load();
const index = CL.buildIndex(CL.GLOSSARY);
const run = (listing) => CL.analyze(listing, null, index);
const ids = (arr) => arr.map((x) => x.id);
const found = (text) => CL.findTerms(text, index).map((h) => h.entry.id + (h.negated ? ":neg" : ""));

// ---------- detectSubgenre ----------

test("detectSubgenre: lens listings", () => {
  assert.equal(CL.detectSubgenre("Canon EF 50mm F1.8 STM 単焦点レンズ 前後キャップ付き"), "lens");
  assert.equal(CL.detectSubgenre("Nikon Ai-S 35mm F2 MFレンズ 絞り羽根に油染みなし ヘリコイド良好"), "lens");
  assert.equal(CL.detectSubgenre("ズームレンズ 24-70mm F2.8 レンズ単体 フード付き"), "lens");
});

test("detectSubgenre: film camera listings", () => {
  assert.equal(CL.detectSubgenre("Canon AE-1 フィルムカメラ 一眼レフ 50mm F1.8付き 露出計OK 巻き上げOK"), "film_camera");
  assert.equal(CL.detectSubgenre("ライカ M3 レンジファインダー 二重像クリア"), "film_camera");
  assert.equal(CL.detectSubgenre("マミヤ 中判カメラ ブローニー 120フィルム対応"), "film_camera");
});

test("detectSubgenre: digital camera listings", () => {
  assert.equal(CL.detectSubgenre("ソニー α7 III ミラーレス ボディ ショット数 約5000回 バッテリー2個"), "digital_camera");
  // 一眼レフ without film context, and 保護フィルム (screen protector) is not camera film.
  assert.equal(CL.detectSubgenre("Nikon D750 デジタル一眼レフ ボディ 液晶に保護フィルム貼付"), "digital_camera");
});

test("detectSubgenre: watches and general items get null", () => {
  assert.equal(CL.detectSubgenre("セイコー 自動巻き 腕時計 デイト"), null);
  assert.equal(CL.detectSubgenre("カシオ デジタル 腕時計 クオーツ"), null, "デジタル on a watch is not a digital camera");
  assert.equal(CL.detectSubgenre("ぬいぐるみ"), null);
  assert.equal(CL.detectGenre("iPhone 保護フィルム 新品"), "general", "screen protector film is not a camera");
});

test("detectSubgenre: a body sold with a kit lens is not a lens listing", () => {
  assert.notEqual(CL.detectSubgenre("Nikon F 一眼レフ ボディ 50mm F1.4 付き"), "lens");
});

test("analyze: genre stays camera/watch/general and subgenre is added", () => {
  const lens = run({ title: "Canon EF 50mm F1.8 単焦点レンズ", description: "最短撮影距離0.35m。前後キャップ付き。AF不良なし。" });
  assert.equal(lens.genre, "camera");
  assert.equal(lens.subgenre, "lens");
  for (const id of ["tanshouten", "saitan_kyori", "zengo_cap"]) assert.ok(ids(lens.terms).includes(id), id);
  const film = run({ title: "Canon AE-1 フィルムカメラ", description: "露出計OK。モルト交換済み。光線漏れなし。" });
  assert.equal(film.genre, "camera");
  assert.equal(film.subgenre, "film_camera");
  const watch = run({ title: "セイコー 腕時計", description: "自動巻き。日差+5秒。" });
  assert.equal(watch.genre, "watch");
  assert.equal(watch.subgenre, null);
});

// ---------- New dictionary terms ----------

test("lens terms are found, and defect terms are negated by なし", () => {
  assert.deepEqual(found("前玉に拭き傷なし。AF不良なし。"), ["maedama", "fukikizu:neg", "af_fuuryou:neg"]);
  assert.deepEqual(found("手ブレ補正不良あり"), ["is_fuuryou"]);
  assert.deepEqual(found("ピントリングが重いです"), ["ring_heavy"]);
  assert.deepEqual(found("絞り連動不良あり。マウントガタなし。"), ["shibori_rendou_fuuryou", "mount_gata:neg"]);
  assert.deepEqual(found("アトムレンズのため黄変があります"), ["atom_lens", "yellowing"]);
});

test("cleaned haze / mold read as service notes, leftover marks as defects", () => {
  assert.deepEqual(found("クモリ取り済みです。カビ跡が少しあります。"), ["kumori_tori_zumi", "kabi_ato"]);
  const r = run({ title: "オールドレンズ 50mm F2", description: "カビ取り済み。カビ跡なし。" });
  assert.ok(!ids(r.flags).includes("kabi"), "カビ取り済み is not the 'mold present' warning");
  assert.ok(r.reassurances.some((x) => x.id === "kabi_ato" && x.negated));
});

test("film camera terms are found, and defect terms are negated by なし", () => {
  assert.deepEqual(found("モルト交換済み、光線漏れなし。電池室に腐食あり。"), ["molt_koukan_zumi", "kousen_more:neg", "denchishitsu_fushoku"]);
  assert.deepEqual(found("ミラー落ちしています"), ["mirror_fault"]);
  assert.deepEqual(found("セルフタイマー不動"), ["self_timer_fudou"]);
  assert.deepEqual(found("スローガバナー整備済み"), ["slow_governor", "seibi_zumi"]);
  const r = run({ title: "フィルムカメラ", description: "モルト交換済み。光線漏れなし。シャッター速度ズレあり。" });
  assert.ok(ids(r.reassurances).includes("molt_koukan_zumi"));
  assert.ok(r.reassurances.some((x) => x.id === "kousen_more" && x.negated));
  assert.ok(ids(r.flags).includes("shutter_speed_zure"));
});

test("specific faults win over the generic word they contain", () => {
  // セルフタイマー不動 is a minor fault, not the whole camera being 不動 (dead).
  assert.ok(!found("セルフタイマー不動").includes("fudou"));
  // 実写未確認 (not film-tested) is narrower than 未確認 (untested).
  assert.deepEqual(found("実写未確認です"), ["jissha_mikakunin"]);
});

// ---------- False-positive guards ----------

test("false positive: screen-protector film is not camera film", () => {
  assert.deepEqual(found("スマホ 保護フィルム入り"), []);
  const r = run({ title: "iPhone 保護フィルム", description: "ガラスフィルム 2枚入り 未使用" });
  assert.equal(r.genre, "general");
  assert.equal(r.subgenre, null);
});

test("false positive: leather edge paint (コバ) and plain 巻き戻し are not lens/film terms", () => {
  assert.deepEqual(found("財布のコバ剥がれあり"), []);
  assert.deepEqual(found("テープの巻き戻し機能付き"), [], "rewind crank needs クランク/ノブ");
  assert.deepEqual(found("貼り合わせ部分のはがれ").filter((x) => x === "harigawase"), [], "貼り合わせ alone (crafts) is not matched");
});

test("false positive: ハーフサイズ alone is not a half-frame camera", () => {
  assert.deepEqual(found("ハーフサイズのトートバッグ"), [], "ハーフサイズ alone is not a half-frame camera");
});

// ---------- Glossary shape ----------

test("glossary grew and includes lens and film_camera genres", () => {
  const E = CL.GLOSSARY.entries;
  assert.ok(E.length >= 281, `entries: ${E.length}`);
  const lens = E.filter((e) => e.genre.includes("lens"));
  const film = E.filter((e) => e.genre.includes("film_camera"));
  assert.ok(lens.length >= 25, `lens: ${lens.length}`);
  assert.ok(film.length >= 20, `film: ${film.length}`);
  for (const e of [...lens, ...film]) assert.ok(e.genre.includes("camera"), `${e.id} keeps the camera umbrella`);
});

// 誤検出の回帰：ジャンルが判定できない出品（パーカー）で「フード」をレンズフードと解説しない
test("a hoodie's フード付き is not explained as a lens hood", () => {
  const r = CL.analyze({ title: "パーカー フード付き Mサイズ", description: "綿100%のパーカーです。フード付きで暖かいです。数回着用しました。" }, null, index);
  assert.equal(r.genre, "general");
  assert.ok(!r.terms.some((t) => t.id === "hood"), JSON.stringify(r.terms.map((t) => t.id)));
  const lens = CL.analyze({ title: "単焦点レンズ 50mm F1.8", description: "純正のレンズフード付きです。前後キャップあり。" }, null, index);
  assert.ok(lens.terms.some((t) => t.id === "hood"));
});

// ---------- Glossary review 2026-10-09: false positives in non-camera/watch listings ----------
// すべて自作の例文（実在の出品のコピーではない）。

test("exclude_prev: 良品 inside 不良品 / 無印良品 is not the 'Good' shop rank", () => {
  assert.deepEqual(found("不良品ではありません"), []);
  assert.deepEqual(found("無印良品の収納ケース"), []);
  assert.deepEqual(found("並品と良品の中間です"), ["namihin", "ryouhin"]);
});

test("false positive: 止まる meaning 'fastens' is not a stopping watch", () => {
  assert.deepEqual(found("マグネットでしっかり止まります"), []);
  assert.deepEqual(found("ボタンで止まる仕様です"), []);
  assert.deepEqual(found("時々止まることがあります"), ["tomaru"]);
  assert.deepEqual(found("たまに止まる"), ["tomaru"]);
});

test("false positive: anti-mould / 浮かび / frosted glass / anti-fog are not fungus or haze", () => {
  assert.deepEqual(found("防カビ加工 カビ防止スプレー カビ取り剤"), []);
  assert.deepEqual(found("ロゴが浮かび上がるデザイン"), []);
  assert.deepEqual(found("曇りガラスの引き戸 曇り止め加工"), []);
  assert.deepEqual(found("カビあり、くもりなし"), ["kabi", "kumori:neg"]);
  assert.deepEqual(found("白濁あり"), ["kumori"]);
});

test("false positive: Chile, chili, frizzy (チリチリ) are not lens dust", () => {
  assert.deepEqual(found("チリ産ワイン チリパウダー 毛先がチリチリ"), []);
  assert.deepEqual(found("チリ少々あり"), ["dust"]);
  assert.deepEqual(found("内部にチリ・ホコリ混入"), ["dust", "dust"]);
});

test("false positive: sewing needles, 方針, polishing compound, nail polish, anti-corrosion", () => {
  assert.deepEqual(found("縫い針と待ち針のセット。当店の方針です"), []);
  assert.deepEqual(found("研磨剤 ネイルポリッシュ"), []);
  assert.deepEqual(found("腐食に強い 耐腐食加工"), []);
  assert.deepEqual(found("電池端子に腐食あり"), ["fushoku"]);
  assert.deepEqual(found("ケース研磨歴あり ポリッシュ済み"), ["kenma", "kenma"]);
});

test("false positive: light-leak prevention, burn guard, sunscreen, food, clothing sizes", () => {
  assert.deepEqual(found("遮光カーテン 光漏れ防止"), []);
  assert.deepEqual(found("ヤケド防止 日焼け止め"), []);
  assert.deepEqual(found("ドッグフード フードプロセッサー フードパーカー"), []);
  assert.deepEqual(found("SSサイズ"), []);
  assert.deepEqual(found("N品番のパーツ"), []);
});

test("missed variants: '実写確認はしていません' is NOT the 'film-tested' reassurance", () => {
  assert.deepEqual(found("実写確認はしていません"), ["jissha_mikakunin"]);
  assert.deepEqual(found("試写はしておりません"), ["jissha_mikakunin"]);
  assert.deepEqual(found("動作は未確認です"), ["dousa_mikakunin"]);
  assert.deepEqual(found("O/H済み"), ["oh_done"]);
  assert.deepEqual(found("K18YG"), ["k18"]);
  assert.deepEqual(found("シャッター泣きあり"), ["shutter_naki"]);
  assert.deepEqual(found("巻き戻しができない"), ["makimodoshi_fuuryou"]);
  assert.deepEqual(found("返品・交換不可"), ["henpin_fuka"]);
});
