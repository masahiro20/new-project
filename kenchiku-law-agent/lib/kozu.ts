// 公図（登記所備付地図）を地番で引く。
//
// 法務省が G空間情報センターで公開している「登記所備付地図データ」（地図XML、市区町村ごと
// の zip）には、公共座標の地図だけでなく任意座標の公図（地図に準ずる図面）も入っている。
// zip の中の search-list.csv が「地番区域・地番 → 図面ファイル」の索引なので、
//   1) zip の目次（末尾）だけを Range で読む
//   2) 索引 CSV（約1.5MB）を読んで、住所の地番区域・地番に当たる図面を探す
//   3) その図面（1MB 前後）だけを読んで、目的の筆と周りの筆の形・地番を取り出す
// とすれば、100MB を超える zip 全体を落とさずに公図相当の形を描ける。
//
// 分かること：地番・筆の形・図上の面積・地図の種類（旧土地台帳附属地図、土地改良所在図など）
// ・縮尺・座標系。分からないこと：地目・地積・所有者（登記簿にしかない）。

import { inflateSync, unzipSync } from "fflate";

export type KozuLot = { chiban: string; ring: [number, number][]; main: boolean; area: number };
export type KozuResult = {
  status: "ok" | "notfound" | "nodata" | "error";
  query: { district: string; chiban: string } | null;
  district: string | null;
  map: { name: string; kind: string; category: string; scale: string; coord: string; precision: string; number: string; orientationUnknown: boolean } | null;
  lots: KozuLot[];
  /** 図上の面積（㎡、参考） */
  area: number | null;
  dataset: { title: string; year: string; page: string } | null;
  message: string;
};

export const KOZU_SOURCE = { label: "法務省 登記所備付地図データ（G空間情報センター）", url: "https://front.geospatial.jp/moj-chizu-xml-download/" };

const UA = { "User-Agent": "kenchiku-law-agent (in-house)" };
const TTL = 12 * 60 * 60 * 1000;
const NEIGHBOUR_M = 45;

// ---------------------------------------------------------------- address → 地番区域 + 地番

const KANJI: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiNumber(s: string): number {
  // 一〜九十九 (enough for 丁目)
  if (s === "十") return 10;
  const m = s.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? KANJI[m[1]] : 1) * 10 + (m[2] ? KANJI[m[2]] : 0);
  return Number([...s].map((c) => KANJI[c] ?? "").join("")) || 0;
}

/** Half-width digits, 一丁目 → 1丁目, no spaces. */
export function normalizeDistrict(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[〇一二三四五六七八九十]+(?=丁目)/g, (k) => String(kanjiNumber(k)))
    .replace(/[\s　]/g, "")
    .replace(/ヶ/g, "ケ");
}

/** 「12番7」「12番地7」「12-7」「１２番７」→ "12-7"; 「12番」→ "12". Returns the 地番 and the text before it. */
export function splitChiban(address: string): { before: string; chiban: string } | null {
  const a = normalizeDistrict(address).replace(/[‐－―−ー]/g, "-");
  const m = a.match(/^(.*?)(\d+)(?:番地?|-)(\d+)?(?:号)?\s*$/) ?? a.match(/^(.*?)(\d+)番地?$/) ?? a.match(/^(.*[^\d-])(\d+)()$/);
  if (!m || !m[1]) return null;
  const chiban = m[3] ? `${m[2]}-${m[3]}` : m[2];
  return { before: m[1], chiban };
}

// ---------------------------------------------------------------- remote zip via Range

type Entry = { name: string; method: number; compSize: number; offset: number };

async function range(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { ...UA, Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(30000) });
  if (res.status !== 206 && res.status !== 200) throw new Error(`range ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return res.status === 200 ? buf.subarray(start, end + 1) : buf;
}

async function size(url: string): Promise<{ size: number; url: string }> {
  // A 1-byte range tells the total size and resolves the redirect to the storage URL.
  const res = await fetch(url, { headers: { ...UA, Range: "bytes=0-0" }, signal: AbortSignal.timeout(20000) });
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? 0);
  await res.arrayBuffer().catch(() => undefined);
  if (!total) throw new Error("zip size unknown");
  return { size: total, url: res.url || url };
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function centralDirectory(url: string): Promise<{ url: string; entries: Entry[] }> {
  const { size: total, url: direct } = await size(url);
  const tail = await range(direct, Math.max(0, total - 66_000), total - 1);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) {
    eocd = i;
    break;
  }
  if (eocd < 0) throw new Error("zip end not found");
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  const cd = await range(direct, cdOffset, cdOffset + cdSize - 1);
  const entries: Entry[] = [];
  const dec = new TextDecoder("utf-8");
  for (let p = 0; p + 46 <= cd.length && u32(cd, p) === 0x02014b50; ) {
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const offset = u32(cd, p + 42);
    entries.push({ name: dec.decode(cd.subarray(p + 46, p + 46 + nameLen)), method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { url: direct, entries };
}

async function readEntry(url: string, e: Entry): Promise<Uint8Array> {
  const head = await range(url, e.offset, e.offset + 29);
  const start = e.offset + 30 + u16(head, 26) + u16(head, 28);
  const data = await range(url, start, start + e.compSize - 1);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateSync(data);
  throw new Error(`zip method ${e.method}`);
}

// ---------------------------------------------------------------- dataset + index (cached per instance)

type Dataset = { title: string; year: string; page: string; zips: string[] };
const datasetCache = new Map<string, { at: number; value: Dataset | null }>();
type Index = { url: string; entries: Entry[]; rows: Map<string, Map<string, string>> };
const indexCache = new Map<string, { at: number; value: Index }>();

async function findDataset(muniCd: string): Promise<Dataset | null> {
  const hit = datasetCache.get(muniCd);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  type R = { result: { results: { name: string; title: string; resources: { name?: string; url: string }[] }[] } };
  const r = (await (
    await fetch(`https://www.geospatial.jp/ckan/api/3/action/package_search?q=res_name:${muniCd}*&rows=20&sort=metadata_modified+desc`, { headers: UA, signal: AbortSignal.timeout(20000) })
  ).json()) as R;
  // Newest year per zip prefix (a city can be split between registry offices: 22138-0804-2026.zip …).
  const best = new Map<string, { year: string; url: string; title: string; page: string }>();
  for (const p of r.result.results) {
    if (!p.title.includes("登記所備付地図データ")) continue;
    for (const res of p.resources) {
      const m = (res.name ?? "").match(new RegExp(`^(${muniCd}-\\d{4})-(\\d{4})\\.zip$`));
      if (!m) continue;
      const cur = best.get(m[1]);
      if (!cur || m[2] > cur.year) best.set(m[1], { year: m[2], url: res.url, title: p.title, page: `https://www.geospatial.jp/ckan/dataset/${p.name}` });
    }
  }
  const list = [...best.values()];
  const value = list.length ? { title: list[0].title, year: list[0].year, page: list[0].page, zips: list.map((x) => x.url) } : null;
  datasetCache.set(muniCd, { at: Date.now(), value });
  return value;
}

/** search-list.csv → normalized 地番区域 → (地番 → 図面 zip). */
async function loadIndex(zipUrl: string): Promise<Index> {
  const hit = indexCache.get(zipUrl);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const { url, entries } = await centralDirectory(zipUrl);
  const list = entries.find((e) => e.name.endsWith("search-list.csv"));
  if (!list) throw new Error("search-list.csv がありません");
  const text = new TextDecoder("shift_jis").decode(await readEntry(url, list));
  const rows = new Map<string, Map<string, string>>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [file, , district, chiban] = line.split(",");
    if (!file || !district || !chiban) continue;
    const key = normalizeDistrict(district);
    let m = rows.get(key);
    if (!m) rows.set(key, (m = new Map()));
    m.set(chiban, file);
  }
  const value = { url, entries, rows };
  indexCache.set(zipUrl, { at: Date.now(), value });
  return value;
}

// ---------------------------------------------------------------- 地図XML

function tagText(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "";
}

/** Shoelace area of a ring in the map's metric coordinates. */
function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}

export function parseKozu(xml: string, target: { districtName: string; chiban: string }): Pick<KozuResult, "map" | "lots" | "area"> | null {
  const points = new Map<string, [number, number]>();
  for (const m of xml.matchAll(/<zmn:GM_Point id="([^"]+)">[\s\S]*?<zmn:X>([-\d.]+)<\/zmn:X>\s*<zmn:Y>([-\d.]+)<\/zmn:Y>/g)) points.set(m[1], [Number(m[3]), -Number(m[2])]); // 公共座標: X=北, Y=東 → screen x=Y, y=-X
  const curves = new Map<string, [number, number][]>();
  for (const m of xml.matchAll(/<zmn:GM_Curve id="([^"]+)">([\s\S]*?)<\/zmn:GM_Curve>/g)) {
    const pts: [number, number][] = [];
    for (const c of m[2].matchAll(/<zmn:GM_Position\.direct>\s*<zmn:X>([-\d.]+)<\/zmn:X>\s*<zmn:Y>([-\d.]+)<\/zmn:Y>|<zmn:GM_PointRef\.point idref="([^"]+)"/g)) {
      if (c[3]) {
        const p = points.get(c[3]);
        if (p) pts.push(p);
      } else pts.push([Number(c[2]), -Number(c[1])]);
    }
    curves.set(m[1], pts);
  }
  const surfaces = new Map<string, string[]>();
  for (const m of xml.matchAll(/<zmn:GM_Surface id="([^"]+)">([\s\S]*?)<\/zmn:GM_Surface>/g)) {
    const ext = m[2].match(/<zmn:GM_SurfaceBoundary\.exterior>([\s\S]*?)<\/zmn:GM_SurfaceBoundary\.exterior>/)?.[1] ?? m[2];
    surfaces.set(m[1], [...ext.matchAll(/generator idref="([^"]+)"/g)].map((g) => g[1]));
  }
  const ringOf = (surfaceId: string): [number, number][] => {
    const ring: [number, number][] = [];
    for (const cid of surfaces.get(surfaceId) ?? []) {
      let seg = curves.get(cid) ?? [];
      if (ring.length && seg.length) {
        const last = ring[ring.length - 1];
        const d = (p: [number, number]) => Math.hypot(p[0] - last[0], p[1] - last[1]);
        if (d(seg[seg.length - 1]) < d(seg[0])) seg = [...seg].reverse();
        if (d(seg[0]) < 0.001) seg = seg.slice(1);
      }
      ring.push(...seg);
    }
    return ring;
  };
  const fude = [...xml.matchAll(/<筆 id="([^"]+)">([\s\S]*?)<\/筆>/g)].map((m) => ({
    id: m[1],
    district: normalizeDistrict(`${tagText(m[2], "大字名")}${tagText(m[2], "丁目名")}`),
    chiban: tagText(m[2], "地番"),
    surface: m[2].match(/<形状 idref="([^"]+)"/)?.[1] ?? "",
  }));
  const main = fude.find((f) => f.chiban === target.chiban && target.districtName.endsWith(f.district));
  if (!main) return null;
  const mainRing = ringOf(main.surface);
  if (mainRing.length < 3) return null;
  const cx = mainRing.reduce((s, p) => s + p[0], 0) / mainRing.length;
  const cy = mainRing.reduce((s, p) => s + p[1], 0) / mainRing.length;
  const lots: KozuLot[] = [];
  for (const f of fude) {
    const ring = f === main ? mainRing : ringOf(f.surface);
    if (ring.length < 3) continue;
    const near = ring.some(([x, y]) => Math.hypot(x - cx, y - cy) < NEIGHBOUR_M);
    if (f !== main && !near) continue;
    lots.push({ chiban: f.chiban, ring: ring.map(([x, y]) => [Math.round((x - cx) * 100) / 100, Math.round((y - cy) * 100) / 100]), main: f === main, area: Math.round(ringArea(ring) * 100) / 100 });
  }
  // The 図郭 (sheet) that lists the lot: map kind, scale, orientation.
  const sheet = [...xml.matchAll(/<図郭>([\s\S]*?)<\/図郭>/g)].find((m) => m[1].includes(`idref="${main.id}"`))?.[1] ?? "";
  const map = {
    name: tagText(xml, "地図名"),
    kind: tagText(sheet, "地図種類"),
    category: tagText(sheet, "地図分類"),
    scale: tagText(sheet, "縮尺分母"),
    coord: tagText(xml, "座標系"),
    precision: tagText(sheet, "精度区分") || tagText(xml, "精度区分"),
    number: tagText(sheet, "地図番号"),
    orientationUnknown: tagText(sheet, "方位不明フラグ") === "true",
  };
  lots.sort((a, b) => Number(b.main) - Number(a.main));
  return { map, lots: lots.slice(0, 120), area: lots[0]?.area ?? null };
}

// ---------------------------------------------------------------- public

const resultCache = new Map<string, { at: number; value: KozuResult }>();

/** muniCd from the GSI reverse geocoder for the site; address carries the 地番. */
export async function lookupKozu(address: string, muniCd: string): Promise<KozuResult> {
  const key = `${muniCd}|${normalizeDistrict(address)}`;
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const base: KozuResult = { status: "error", query: null, district: null, map: null, lots: [], area: null, dataset: null, message: "" };
  let result: KozuResult;
  try {
    const split = splitChiban(address);
    if (!split) result = { ...base, status: "notfound", message: "住所から地番（「12番7」「12-7」など）を読み取れませんでした。地番まで入れてください。" };
    else {
      const ds = await findDataset(muniCd);
      if (!ds) result = { ...base, status: "nodata", message: "この市区町村の登記所備付地図データが見つかりませんでした。" };
      else {
        let found: { index: Index; district: string; file: string } | null = null;
        for (const zip of ds.zips) {
          const index = await loadIndex(zip);
          // Longest 地番区域 that ends the text before the 地番 (e.g. "岐阜市水海道1丁目").
          const before = split.before;
          let best = "";
          for (const district of index.rows.keys()) if (district.length > best.length && before.endsWith(district.replace(/^.*?[市町村区](?=.)/, "")) && index.rows.get(district)!.has(split.chiban)) best = district;
          if (!best) for (const district of index.rows.keys()) if (district.length > best.length && before.includes(district) && index.rows.get(district)!.has(split.chiban)) best = district;
          if (best) {
            found = { index, district: best, file: index.rows.get(best)!.get(split.chiban)! };
            break;
          }
        }
        const query = { district: split.before, chiban: split.chiban };
        const dataset = { title: ds.title, year: ds.year, page: ds.page };
        if (!found) result = { ...base, status: "notfound", query, dataset, message: `地番「${split.chiban}」が登記所備付地図データに見つかりませんでした。住所が住居表示（「○番○号」）の場合は、登記簿の地番で入れてください。` };
        else {
          const entry = found.index.entries.find((e) => e.name === found!.file);
          if (!entry) throw new Error(`${found.file} がありません`);
          const inner = unzipSync(await readEntry(found.index.url, entry));
          const xmlName = Object.keys(inner).find((n) => n.endsWith(".xml"));
          if (!xmlName) throw new Error("地図XMLがありません");
          const parsed = parseKozu(new TextDecoder("utf-8").decode(inner[xmlName]), { districtName: found.district, chiban: split.chiban });
          result = parsed
            ? { ...base, status: "ok", query, district: found.district, dataset, ...parsed, message: "" }
            : { ...base, status: "notfound", query, district: found.district, dataset, message: "図面の中で筆の形を取り出せませんでした。" };
        }
      }
    }
  } catch (e) {
    console.error("kozu lookup failed", e);
    result = { ...base, message: `公図データの取得に失敗しました（${e instanceof Error ? e.message : "不明なエラー"}）。` };
  }
  if (result.status !== "error") resultCache.set(key, { at: Date.now(), value: result });
  return result;
}

export function kozuText(r: KozuResult): string {
  if (r.status !== "ok" || !r.map) return r.message;
  const m = r.map;
  return `${r.district ?? ""} ${r.query?.chiban ?? ""}：${m.category || m.kind}（${m.kind}${m.scale ? `・1/${m.scale}` : ""}・${m.coord}${m.precision ? `・精度区分 ${m.precision}` : ""}）。図上の面積 約${r.area}㎡（参考。登記の地積とは異なる）。隣接 ${r.lots.length - 1} 筆。［出典：${KOZU_SOURCE.label} ${r.dataset?.year ?? ""}年版］`;
}
