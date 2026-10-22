// 地番図（公図の代わりの手がかり）: 法務省「登記所備付地図データ」を
// (一社)社会基盤情報流通推進協議会（AIGID）が市区町村ごとに GeoJSON にしたもの
// （G空間情報センター、CC BY）から、住所の代表点が入る筆と周りの筆を探す。
//
// 分かること：大字・地番・筆の形・座標の種類（測量成果／図上測量）。
// 分からないこと：地目・地積・所有者（登記簿にしかない）。
// 収録は公共座標の地図だけ。任意座標の公図（古い市街地・農村部に多い）は位置が
// 決まらないため含まれず、その場合は「データなし」と返す。

import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export type Lot = {
  oaza: string;
  chiban: string;
  /** 測量成果 = 測量の座標、図上測量 = 図面から読み取った座標 */
  kind: string | null;
  /** [lon, lat] */
  ring: [number, number][];
  contains: boolean;
  /** metres from the point to the lot's centroid */
  distance: number;
};

export type ChibanResult = {
  status: "ok" | "none" | "nodata" | "error";
  muniCd: string | null;
  townName: string | null;
  dataset: { title: string; url: string; year: string; page: string } | null;
  lots: Lot[];
  message: string;
};

export const CHIBAN_SOURCE = {
  label: "法務省 登記所備付地図データ（G空間情報センター・AIGID変換）",
  url: "https://front.geospatial.jp/moj-chizu-xml-download/",
};

const RADIUS_M = 90;
const datasetCache = new Map<string, { at: number; value: ChibanResult["dataset"] }>();
const resultCache = new Map<string, { at: number; value: ChibanResult }>();
const TTL = 12 * 60 * 60 * 1000;

async function getJson<T>(url: string, ms = 15000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "kenchiku-law-agent (in-house)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function municipality(lat: number, lon: number): Promise<{ muniCd: string; town: string } | null> {
  const r = await getJson<{ results?: { muniCd?: string; lv01Nm?: string } }>(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`);
  const cd = r.results?.muniCd;
  return cd ? { muniCd: cd.padStart(5, "0"), town: r.results?.lv01Nm ?? "" } : null;
}

/** Latest GeoJSON of the city on G空間情報センター (dataset aigid-moj-<code>). */
async function dataset(muniCd: string): Promise<ChibanResult["dataset"]> {
  const hit = datasetCache.get(muniCd);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  type Pkg = { result: { title: string; name: string; resources: { name?: string; format?: string; url: string }[] } };
  let value: ChibanResult["dataset"] = null;
  try {
    const p = await getJson<Pkg>(`https://www.geospatial.jp/ckan/api/3/action/package_show?id=aigid-moj-${muniCd}`);
    const files = p.result.resources
      .filter((r) => /geojson/i.test(r.format ?? "") || /\.geojson$/i.test(r.url))
      .map((r) => ({ url: r.url, year: (r.name ?? r.url).match(/(20\d{2})(?:\.geojson)?$/)?.[1] ?? (r.name ?? "").match(/20\d{2}/)?.[0] ?? "" }))
      .sort((a, b) => b.year.localeCompare(a.year));
    if (files[0]) value = { title: p.result.title, url: files[0].url, year: files[0].year, page: `https://www.geospatial.jp/ckan/dataset/${p.result.name}` };
  } catch {
    value = null;
  }
  datasetCache.set(muniCd, { at: Date.now(), value });
  return value;
}

/** Downloads the city file once per instance into /tmp (tens of MB). */
async function localFile(muniCd: string, url: string, year: string): Promise<string> {
  const path = `/tmp/chiban-${muniCd}-${year}.geojson`;
  if (existsSync(path) && statSync(path).size > 1000) return path;
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const tmp = `${path}.part`;
  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(tmp));
  await rename(tmp, path);
  return path;
}

const M_LAT = 111_320;
const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function inside(lon: number, lat: number, ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

type Feature = { properties: Record<string, string | null>; geometry: { type: string; coordinates: unknown } | null };

function rings(g: Feature["geometry"]): [number, number][][] {
  if (!g) return [];
  if (g.type === "Polygon") return [(g.coordinates as [number, number][][])[0]];
  if (g.type === "MultiPolygon") return (g.coordinates as [number, number][][][]).map((p) => p[0]);
  return [];
}

export async function scan(path: string, lat: number, lon: number): Promise<Lot[]> {
  const dLat = (RADIUS_M * 2.5) / M_LAT;
  const dLon = (RADIUS_M * 2.5) / mLon(lat);
  const firstVertex = /"coordinates":\s*\[\s*\[\s*\[?\s*\[?\s*([\d.]+),\s*([\d.]+)/;
  const lots: Lot[] = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const raw of rl) {
    if (!raw.includes('"Feature"')) continue;
    const v = raw.match(firstVertex);
    if (!v || Math.abs(Number(v[2]) - lat) > dLat || Math.abs(Number(v[1]) - lon) > dLon) continue;
    let f: Feature;
    try {
      f = JSON.parse(raw.trim().replace(/,$/, "")) as Feature;
    } catch {
      continue;
    }
    for (const ring of rings(f.geometry)) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const distance = Math.hypot((cx - lon) * mLon(lat), (cy - lat) * M_LAT);
      const contains = inside(lon, lat, ring);
      if (!contains && distance > RADIUS_M) continue;
      lots.push({ oaza: `${f.properties["大字名"] ?? ""}${f.properties["丁目名"] ?? ""}`, chiban: String(f.properties["地番"] ?? ""), kind: f.properties["座標値種別"] ?? null, ring, contains, distance: Math.round(distance) });
    }
  }
  return lots.sort((a, b) => Number(b.contains) - Number(a.contains) || a.distance - b.distance).slice(0, 80);
}

export async function lookupChiban(lat: number, lon: number): Promise<ChibanResult> {
  const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const base: ChibanResult = { status: "error", muniCd: null, townName: null, dataset: null, lots: [], message: "" };
  let result: ChibanResult;
  try {
    const muni = await municipality(lat, lon);
    if (!muni) result = { ...base, status: "nodata", message: "市区町村を特定できませんでした。" };
    else {
      const ds = await dataset(muni.muniCd);
      if (!ds) result = { ...base, status: "nodata", muniCd: muni.muniCd, townName: muni.town, message: "この市区町村の地番図データ（公共座標）は公開されていません。" };
      else {
        const lots = await scan(await localFile(muni.muniCd, ds.url, ds.year), lat, lon);
        result =
          lots.length === 0
            ? { ...base, status: "none", muniCd: muni.muniCd, townName: muni.town, dataset: ds, message: "この周辺は公共座標の地図データがありません（任意座標の公図の区域と思われます）。公図は登記情報提供サービスか法務局で取得してください。" }
            : { ...base, status: "ok", muniCd: muni.muniCd, townName: muni.town, dataset: ds, lots, message: lots[0].contains ? "" : "住所の代表点はどの筆にも入っていません（道路・水路上か、データの位置ずれ）。近くの筆を表示しています。" };
      }
    }
  } catch (e) {
    console.error("chiban lookup failed", e);
    result = { ...base, message: `地番図データの取得に失敗しました（${e instanceof Error ? e.message : "不明なエラー"}）。` };
  }
  if (result.status !== "error") resultCache.set(key, { at: Date.now(), value: result });
  return result;
}

/** One line for text outputs (MCP). */
export function chibanText(r: ChibanResult): string {
  if (r.status === "ok") {
    const main = r.lots[0];
    const label = `${main.oaza}${main.chiban}`;
    return main.contains
      ? `代表点が入る筆：${label}（${main.kind ?? "座標種別不明"}）［推測・出典：${CHIBAN_SOURCE.label} ${r.dataset?.year ?? ""}年版］。地目・地積・所有者は登記簿で確認。`
      : `代表点の近くの筆：${label}（約${main.distance}m）［推測］。${r.message}`;
  }
  return r.message;
}
