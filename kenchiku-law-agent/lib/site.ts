// Looks a site up from its address: geocode with 国土地理院 (no key), then read
// the MLIT 不動産情報ライブラリ GIS layers (API key, free, application required)
// for the tile containing the point and test which polygons contain it.
// Every value returned carries its dataset name and year so the UI and the
// agent can cite it as 【公的】 evidence.

import { EMPTY_SIGNALS, HAZARDS, type PlanInput, type Signals } from "./plan";
import { FUDE_SOURCE, GSI_VT_SOURCE, lookupFarmland, lookupWater, type FarmlandResult, type WaterResult } from "./nearby";

export { FUDE_SOURCE, GSI_VT_SOURCE };

const GSI = "https://msearch.gsi.go.jp/address-search/AddressSearch";
const REINFOLIB = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const ZOOM = 15;
const LINE_HIT_METERS = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;

export type LayerStatus = "hit" | "none" | "skipped" | "error";

export type LayerResult = {
  id: string;
  label: string;
  status: LayerStatus;
  /** One line per matched feature, human readable. */
  summary: string[];
  features: Record<string, unknown>[];
  source: { label: string; url: string; year: string };
  error?: string;
};

export type SiteContext = {
  address: string;
  matched: string | null;
  lat: number | null;
  lon: number | null;
  tile: { z: number; x: number; y: number } | null;
  apiAvailable: boolean;
  /** False when the geocoder only matched the town (no lot number): area judgements are then estimates. */
  precise?: boolean;
  fetchedAt: string;
  layers: LayerResult[];
  /** 農水省 筆ポリゴン: is the point on / next to farmland. */
  farmland: FarmlandResult | null;
  /** 国土地理院 ベクトルタイル: distance to the nearest river / waterway. */
  water: WaterResult | null;
  derived: {
    signals: Signals;
    areaDivision?: PlanInput["areaDivision"];
    zoning?: PlanInput["zoning"];
    fireZone?: PlanInput["fireZone"];
    hazards: PlanInput["hazards"];
    kenpei?: string;
    yoseki?: string;
    notes: string[];
  };
};

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: string; coordinates: unknown };
type Feature = { type: "Feature"; geometry: Geometry | null; properties: Record<string, unknown> | null };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

const TOSHIKEIKAKU_SRC = { label: "国土交通省 都市計画決定GISデータ", url: "https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html", year: "令和7年度" };
const ksj = (code: string, year: string) => ({
  label: `国土数値情報 ${code}`,
  url: `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-${code}-${year}.html`,
  year,
});

type LayerDef = { id: string; label: string; source: LayerResult["source"]; kind: "polygon" | "line"; describe: (p: Record<string, unknown>) => string };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export const LAYERS: LayerDef[] = [
  { id: "XKT001", label: "都市計画区域・区域区分", source: TOSHIKEIKAKU_SRC, kind: "polygon", describe: (p) => `${s(p.area_classification_ja)}（${s(p.city_name)}、最終告示 ${s(p.decision_date) || "不明"}）` },
  {
    id: "XKT002",
    label: "用途地域",
    source: TOSHIKEIKAKU_SRC,
    kind: "polygon",
    describe: (p) => `${s(p.use_area_ja)}　建蔽率 ${s(p.u_building_coverage_ratio_ja) || "不明"}／容積率 ${s(p.u_floor_area_ratio_ja) || "不明"}（${s(p.city_name)}、最終告示 ${s(p.decision_date) || "不明"}）`,
  },
  { id: "XKT014", label: "防火・準防火地域", source: TOSHIKEIKAKU_SRC, kind: "polygon", describe: (p) => `${s(p.fire_prevention_ja)}（${s(p.city_name)}、最終告示 ${s(p.decision_date) || "不明"}）` },
  { id: "XKT023", label: "地区計画", source: TOSHIKEIKAKU_SRC, kind: "polygon", describe: (p) => `${s(p.plan_name)}（${s(p.plan_type_ja)}、${s(p.city_name)}、最終告示 ${s(p.decision_date) || "不明"}）` },
  { id: "XKT003", label: "立地適正化計画", source: TOSHIKEIKAKU_SRC, kind: "polygon", describe: (p) => `${s(p.area_classification_ja)}${p.kubun_name_ja ? `／${s(p.kubun_name_ja)}` : ""}（${s(p.city_name)}）` },
  { id: "XKT030", label: "都市計画道路（付近）", source: TOSHIKEIKAKU_SRC, kind: "line", describe: (p) => `${s(p.planning_road_ja)}（${s(p.city_name)}、決定 ${s(p.decision_date) || "不明"}）` },
  {
    id: "XKT029",
    label: "土砂災害警戒区域",
    source: ksj("A33", "2024"),
    kind: "polygon",
    describe: (p) => {
      const phenomenon: Record<string, string> = { "1": "急傾斜地の崩壊", "2": "土石流", "3": "地滑り" };
      const zone: Record<string, string> = { "1": "土砂災害警戒区域（指定済）", "2": "土砂災害特別警戒区域（指定済）", "3": "土砂災害警戒区域（指定前・基礎調査結果）", "4": "土砂災害特別警戒区域（指定前・基礎調査結果）" };
      return `${zone[s(p.A33_002)] ?? `区域区分コード${s(p.A33_002)}`}／${phenomenon[s(p.A33_001)] ?? `現象コード${s(p.A33_001)}`}　${s(p.A33_005)}（公示 ${s(p.A33_007) || "不明"}）`;
    },
  },
  {
    id: "XKT026",
    label: "洪水浸水想定区域（想定最大規模）",
    source: ksj("A31a", "2024"),
    kind: "polygon",
    describe: (p) => {
      const depth: Record<string, string> = { "1": "0〜0.5m未満", "2": "0.5〜3.0m未満", "3": "3.0〜5.0m未満", "4": "5.0〜10.0m未満", "5": "10.0〜20.0m未満", "6": "20.0m以上" };
      return `${s(p.A31a_202)}（${s(p.A31a_204)}）浸水深 ${depth[s(p.A31a_205)] ?? `ランク${s(p.A31a_205)}`}`;
    },
  },
  { id: "XKT016", label: "災害危険区域", source: { label: "国土数値情報 A48", url: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A48-v1_2.html", year: "v1.2" }, kind: "polygon", describe: (p) => `${s(p.A48_005_ja)}／理由 ${s(p.A48_007_name_ja)}／根拠条例 ${s(p.A48_011)}${p.A48_014 ? `／${s(p.A48_014)}` : ""}` },
  { id: "XKT020", label: "大規模盛土造成地", source: ksj("A54", "2023"), kind: "polygon", describe: (p) => `${s(p.embankment_classification)}（${s(p.city_name)} ${s(p.embankment_number)}）` },
  { id: "XKT021", label: "地すべり防止区域", source: ksj("A46", "2021"), kind: "polygon", describe: (p) => `${s(p.region_name)}（${s(p.address)}、告示 ${s(p.notice_date) || "不明"}、所管 ${s(p.charge_ministry_name)}）` },
  { id: "XKT022", label: "急傾斜地崩壊危険区域", source: ksj("A47", "2021"), kind: "polygon", describe: (p) => `${s(p.region_name)}（${s(p.address)}、公示 ${s(p.public_notice_date) || "不明"}）` },
  {
    id: "XKT025",
    label: "液状化の発生傾向（地形区分）",
    source: { label: "国土交通省 地形区分に基づく液状化の発生傾向図（約250mメッシュ・相対評価）", url: "https://www.mlit.go.jp/toshi/toshi_tobou_tk_000038.html", year: "" },
    kind: "polygon",
    describe: (p) => `${s(p.topographic_classification_name_ja)}：${s(p.note)}`,
  },
  { id: "XKT019", label: "自然公園地域", source: { label: "国土数値情報 自然公園地域", url: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v3_1.html", year: "" }, kind: "polygon", describe: (p) => Object.entries(p).filter(([, v]) => v !== null && v !== "").slice(0, 4).map(([k, v]) => `${k}=${s(v)}`).join("、") },
  { id: "XKT028", label: "津波浸水想定", source: { label: "国土数値情報 津波浸水想定", url: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A40-v1_2.html", year: "" }, kind: "polygon", describe: (p) => Object.entries(p).filter(([, v]) => v !== null && v !== "").slice(0, 4).map(([k, v]) => `${k}=${s(v)}`).join("、") },
  { id: "XKT027", label: "高潮浸水想定区域", source: { label: "国土数値情報 高潮浸水想定区域", url: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A49-v1_0.html", year: "" }, kind: "polygon", describe: (p) => Object.entries(p).filter(([, v]) => v !== null && v !== "").slice(0, 4).map(([k, v]) => `${k}=${s(v)}`).join("、") },
];

// ------------------------------------------------------------------ geometry

export function tileFor(lat: number, lon: number, z = ZOOM): { z: number; x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0 || !pointInRing(lon, lat, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(lon, lat, hole));
}

export function pointInGeometry(lon: number, lat: number, g: Geometry | null): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return pointInPolygon(lon, lat, g.coordinates as number[][][]);
  if (g.type === "MultiPolygon") return (g.coordinates as number[][][][]).some((poly) => pointInPolygon(lon, lat, poly));
  return false;
}

/** Distance in metres from a point to a polyline (equirectangular approximation, fine at site scale). */
export function distanceToLine(lon: number, lat: number, g: Geometry | null): number {
  if (!g) return Infinity;
  const lines = g.type === "LineString" ? [g.coordinates as number[][]] : g.type === "MultiLineString" ? (g.coordinates as number[][][]) : [];
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  let best = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][0] - lon) * kx, ay = (line[i - 1][1] - lat) * ky;
      const bx = (line[i][0] - lon) * kx, by = (line[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      best = Math.min(best, Math.hypot(px, py));
    }
  }
  return best;
}

// ------------------------------------------------------------------ fetching

export type GeocodeHit = { title: string; lat: number; lon: number };

export async function geocode(address: string): Promise<GeocodeHit[]> {
  const res = await fetch(`${GSI}?q=${encodeURIComponent(address)}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`国土地理院 住所検索 ${res.status}`);
  const data = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
  return data.map((d) => ({ title: d.properties.title, lon: d.geometry.coordinates[0], lat: d.geometry.coordinates[1] }));
}

const tileCache = new Map<string, { at: number; value: FeatureCollection }>();

async function fetchLayerTile(id: string, tile: { z: number; x: number; y: number }, key: string): Promise<FeatureCollection> {
  const cacheKey = `${id}:${tile.z}/${tile.x}/${tile.y}`;
  const hit = tileCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const url = `${REINFOLIB}/${id}?response_format=geojson&z=${tile.z}&x=${tile.x}&y=${tile.y}`;
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" } });
  if (!res.ok) throw new Error(`不動産情報ライブラリ ${id} ${res.status}`);
  const data = (await res.json()) as FeatureCollection | unknown[];
  const fc: FeatureCollection = Array.isArray(data) ? { type: "FeatureCollection", features: [] } : data;
  tileCache.set(cacheKey, { at: Date.now(), value: fc });
  return fc;
}

export function reinfolibAvailable(): boolean {
  return Boolean(process.env.REINFOLIB_API_KEY);
}

const siteCache = new Map<string, { at: number; value: SiteContext }>();

export async function lookupSite(address: string): Promise<SiteContext> {
  const trimmed = address.trim();
  const cached = siteCache.get(trimmed);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const ctx: SiteContext = {
    address: trimmed,
    matched: null,
    lat: null,
    lon: null,
    tile: null,
    apiAvailable: reinfolibAvailable(),
    precise: false,
    fetchedAt: new Date().toISOString(),
    layers: [],
    farmland: null,
    water: null,
    derived: { signals: EMPTY_SIGNALS, hazards: [], notes: [] },
  };

  const hits = trimmed ? await geocode(trimmed) : [];
  if (hits.length === 0) {
    ctx.derived.notes.push("住所から位置を特定できませんでした。都道府県から番地まで入れ直してください。");
    return ctx;
  }
  const best = hits[0];
  ctx.matched = best.title;
  ctx.lat = best.lat;
  ctx.lon = best.lon;
  ctx.tile = tileFor(best.lat, best.lon);
  if (hits.length > 1) ctx.derived.notes.push(`候補が${hits.length}件あり、先頭の「${best.title}」を使いました。`);
  const hasNumber = (t: string) => /[0-9０-９]/.test(t);
  ctx.precise = hasNumber(trimmed) && hasNumber(best.title);
  if (hasNumber(trimmed) && !hasNumber(best.title))
    ctx.derived.notes.push(`番地まで特定できず「${best.title}」の代表点で判定しています。農地・川までの距離や区域の判定は敷地とずれている可能性が高いので、番地の書き方（「番地」「-」）を変えて再取得してください。`);
  if (!/\d/.test(trimmed)) ctx.derived.notes.push("番地まで入っていないため、町丁目の代表点で判定しています。敷地の境界付近では用途地域や区域が異なることがあります。");

  const key = process.env.REINFOLIB_API_KEY;
  const nearbyPromise = Promise.all([lookupFarmland(best.lat, best.lon), lookupWater(best.lat, best.lon)]);
  if (!key) {
    ctx.layers = LAYERS.map((l) => ({ id: l.id, label: l.label, status: "skipped" as const, summary: [], features: [], source: l.source }));
    ctx.derived.notes.push("不動産情報ライブラリの API キー（REINFOLIB_API_KEY）が未設定のため、用途地域・区域区分・防火指定・災害区域の自動取得をスキップしました。");
    [ctx.farmland, ctx.water] = await nearbyPromise;
    derive(ctx);
    siteCache.set(trimmed, { at: Date.now(), value: ctx });
    return ctx;
  }

  const tile = ctx.tile;
  ctx.layers = await Promise.all(
    LAYERS.map(async (l): Promise<LayerResult> => {
      try {
        const fc = await fetchLayerTile(l.id, tile, key);
        const matched = fc.features.filter((f) =>
          l.kind === "polygon" ? pointInGeometry(best.lon, best.lat, f.geometry) : distanceToLine(best.lon, best.lat, f.geometry) <= LINE_HIT_METERS,
        );
        const seen = new Set<string>();
        const summary: string[] = [];
        const features: Record<string, unknown>[] = [];
        for (const f of matched) {
          const line = l.describe(f.properties ?? {});
          if (seen.has(line)) continue;
          seen.add(line);
          summary.push(line);
          features.push(f.properties ?? {});
        }
        return { id: l.id, label: l.label, status: matched.length ? "hit" : "none", summary, features, source: l.source };
      } catch (e) {
        return { id: l.id, label: l.label, status: "error", summary: [], features: [], source: l.source, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  [ctx.farmland, ctx.water] = await nearbyPromise;
  derive(ctx);
  siteCache.set(trimmed, { at: Date.now(), value: ctx });
  return ctx;
}

/** Turns the farmland / water lookups and the flood layer into plan signals. */
export function deriveSignals(farmland: FarmlandResult | null, water: WaterResult | null, floodLayer: LayerResult | undefined): Signals {
  const sg: Signals = { ...EMPTY_SIGNALS, floodRivers: [] };
  if (farmland?.status === "ok") {
    const onOrTouching = farmland.onSite !== null || (farmland.nearestMeters !== null && farmland.nearestMeters <= 8);
    if (onOrTouching) {
      sg.farmland = "敷地が農地の可能性";
      sg.farmlandType = farmland.onSite ?? (farmland.nearby.田 >= farmland.nearby.畑 ? "田" : "畑");
    } else if (farmland.nearestMeters !== null) {
      sg.farmland = "周辺に農地";
      sg.farmlandType = farmland.nearby.田 >= farmland.nearby.畑 ? "田" : "畑";
    } else sg.farmland = "なし";
    sg.farmlandMeters = farmland.nearestMeters;
  }
  if (water?.status === "ok") {
    sg.waterMeters = water.nearestMeters;
    sg.waterKind = water.nearestMeters === null ? "なし" : (water.nearestKind ?? "川・水路");
  }
  if (floodLayer?.status === "hit") {
    sg.floodRivers = [...new Set(floodLayer.features.map((f) => `${s(f.A31a_202)}${f.A31a_204 ? `（${s(f.A31a_204)}指定）` : ""}`).filter((n) => n && !n.startsWith("（")))].slice(0, 6);
  }
  return sg;
}

const ZONING_NAMES = new Set<string>([
  "第一種低層住居専用地域",
  "第二種低層住居専用地域",
  "第一種中高層住居専用地域",
  "第二種中高層住居専用地域",
  "第一種住居地域",
  "第二種住居地域",
  "準住居地域",
  "田園住居地域",
  "近隣商業地域",
  "商業地域",
  "準工業地域",
  "工業地域",
  "工業専用地域",
]);

/** The GIS data writes 「第１種」「第2種」; the plan schema uses 「第一種」「第二種」. */
export function normalizeZoningName(name: string): string {
  return name
    .replace(/\s/g, "")
    .replace(/第[1１]種/g, "第一種")
    .replace(/第[2２]種/g, "第二種");
}

function derive(ctx: SiteContext) {
  const layer = (id: string) => ctx.layers.find((l) => l.id === id);
  const d = ctx.derived;
  const hazards = new Set<PlanInput["hazards"][number]>();

  const area = layer("XKT001");
  if (area?.status === "hit") {
    const names = area.features.map((f) => s(f.area_classification_ja));
    if (names.some((n) => n.includes("市街化調整区域"))) d.areaDivision = "市街化調整区域";
    else if (names.some((n) => n.includes("市街化区域"))) d.areaDivision = "市街化区域";
    else if (names.some((n) => n.includes("準都市計画区域"))) d.areaDivision = "準都市計画区域";
    else if (names.some((n) => n.includes("都市計画区域"))) d.areaDivision = "非線引き都市計画区域";
  } else if (area?.status === "none") {
    d.notes.push("都市計画区域・区域区分のデータに該当がありません。都市計画区域外か、自治体がデータ未公表の可能性があります（都市計画課で確認）。");
  }

  const zoning = layer("XKT002");
  if (zoning?.status === "hit") {
    const f = zoning.features[0];
    const name = normalizeZoningName(s(f.use_area_ja));
    if (ZONING_NAMES.has(name)) d.zoning = name as PlanInput["zoning"];
    d.kenpei = s(f.u_building_coverage_ratio_ja) || undefined;
    d.yoseki = s(f.u_floor_area_ratio_ja) || undefined;
    if (zoning.features.length > 1) d.notes.push("地点が複数の用途地域の境界付近にあります。敷地のどの部分がどちらに属するか都市計画図で確認してください。");
  } else if (zoning?.status === "none" && area?.status === "hit") {
    d.zoning = "用途地域の指定なし";
  }

  const fire = layer("XKT014");
  if (fire?.status === "hit") {
    const names = fire.features.map((f) => s(f.fire_prevention_ja));
    if (names.some((n) => n.includes("準防火"))) d.fireZone = "準防火地域";
    if (names.some((n) => n === "防火地域" || (n.includes("防火地域") && !n.includes("準")))) d.fireZone = "防火地域";
  } else if (fire?.status === "none" && area?.status === "hit") {
    d.fireZone = "指定なし";
    d.notes.push("防火・準防火地域の指定はデータ上ありません。法22条区域の指定は別途、建築指導課で確認してください。");
  }

  if (layer("XKT023")?.status === "hit") hazards.add("地区計画の区域");
  if (layer("XKT030")?.status === "hit") {
    hazards.add("都市計画道路・都市計画施設の区域");
    d.notes.push("約40m以内に都市計画道路（線形データ）があります。計画線が敷地にかかるかは都市計画図で確認してください。");
  }
  const dosha = layer("XKT029");
  if (dosha?.status === "hit") {
    const codes = dosha.features.map((f) => s(f.A33_002));
    if (codes.some((c) => c === "2" || c === "4")) hazards.add("土砂災害特別警戒区域（レッド）");
    if (codes.some((c) => c === "1" || c === "3")) hazards.add("土砂災害警戒区域（イエロー）");
    if (codes.some((c) => c === "3" || c === "4")) d.notes.push("土砂災害区域の一部は「指定前（基礎調査結果の公表）」です。指定の見込みを都道府県に確認してください。");
  }
  if (layer("XKT026")?.status === "hit") hazards.add("浸水想定区域");
  if (layer("XKT016")?.status === "hit") hazards.add("災害危険区域（条例）");
  if (layer("XKT020")?.status === "hit") hazards.add("大規模盛土造成地");
  if (layer("XKT021")?.status === "hit") hazards.add("地すべり防止区域");
  if (layer("XKT022")?.status === "hit") hazards.add("急傾斜地崩壊危険区域");
  if (layer("XKT019")?.status === "hit") hazards.add("自然公園（国立・国定・県立）");
  if (layer("XKT028")?.status === "hit" || layer("XKT027")?.status === "hit") hazards.add("浸水想定区域");
  const ritteki = layer("XKT003");
  if (ritteki?.status === "hit") {
    const names = ritteki.features.map((f) => `${s(f.area_classification_ja)} ${s(f.kubun_name_ja)}`);
    if (!names.some((n) => n.includes("居住誘導"))) hazards.add("立地適正化計画区域（居住誘導区域外の可能性）");
  }

  d.hazards = [...hazards].filter((h) => (HAZARDS as readonly string[]).includes(h));

  d.signals = deriveSignals(ctx.farmland, ctx.water, layer("XKT026"));
  // Farmland / water findings are shown as alerts and table rows (and in siteToText), not repeated as notes.
  if (ctx.water?.insideWater) d.notes.push("地点が地図上の水面（川・池・水路）の中にあります。住所の位置ずれか、敷地に水路・河川区域が含まれる可能性があります。");
  if (ctx.farmland?.status === "error") d.notes.push(`農地の判定（筆ポリゴン）に失敗しました：${ctx.farmland.error ?? ""}`);
  if (ctx.water?.status === "error") d.notes.push(`川・水路の判定（地理院ベクトルタイル）に失敗しました：${ctx.water.error ?? ""}`);

  const errors = ctx.layers.filter((l) => l.status === "error");
  if (errors.length) d.notes.push(`取得に失敗したレイヤ：${errors.map((l) => l.label).join("、")}（${errors[0].error ?? ""}）。手動で確認してください。`);
}

/** Fills "不明" fields of a plan with what the lookup found; explicit user choices win. */
export function mergeSiteIntoPlan(plan: PlanInput, site: SiteContext | null): PlanInput {
  if (!site) return plan;
  const d = site.derived;
  return {
    ...plan,
    areaDivision: plan.areaDivision === "不明" && d.areaDivision ? d.areaDivision : plan.areaDivision,
    zoning: plan.zoning === "不明" && d.zoning ? d.zoning : plan.zoning,
    fireZone: plan.fireZone === "不明" && d.fireZone ? d.fireZone : plan.fireZone,
    hazards: [...new Set([...plan.hazards, ...d.hazards])],
    landCategory: plan.landCategory === "不明" && d.signals.farmland === "敷地が農地の可能性" ? "田・畑（農地）" : plan.landCategory,
    signals: d.signals,
  };
}

/** Markdown block handed to the model as 【公的】 evidence. */
export function siteToText(site: SiteContext | null): string {
  if (!site) return "（住所未入力のため自動取得なし）";
  const lines: string[] = [];
  lines.push(`入力住所：${site.address}／ジオコーディング結果：${site.matched ?? "特定できず"}（国土地理院 住所検索API）`);
  if (site.lat !== null && site.lon !== null) lines.push(`座標：北緯 ${site.lat.toFixed(6)}、東経 ${site.lon.toFixed(6)}（タイル z${site.tile?.z}/${site.tile?.x}/${site.tile?.y}）`);
  if (!site.apiAvailable) lines.push("※ 不動産情報ライブラリ API キー未設定のため、以下のレイヤは未取得。");
  for (const l of site.layers) {
    if (l.status === "skipped") continue;
    const src = `${l.source.label}${l.source.year ? `（${l.source.year}）` : ""} ${l.source.url}`;
    if (l.status === "hit") lines.push(`- ${l.label}：該当 — ${l.summary.join("／")}　出典：${src}`);
    else if (l.status === "none") lines.push(`- ${l.label}：該当なし　出典：${src}`);
    else lines.push(`- ${l.label}：取得エラー（${l.error ?? ""}）`);
  }
  const f = site.farmland;
  if (f) {
    const src = `出典：${FUDE_SOURCE.label} ${FUDE_SOURCE.url}`;
    if (f.status === "error") lines.push(`- 農地（筆ポリゴン）：取得エラー（${f.error ?? ""}）`);
    else
      lines.push(
        `- 農地（筆ポリゴン、航空写真判読の現況農地）：${f.onSite ? `地点は${f.onSite}の区画上` : f.nearestMeters !== null ? `最寄りの農地区画まで約${f.nearestMeters}m` : "地点の半径60m以内に農地区画なし"}／半径${f.radius}m以内 田${f.nearby.田}筆・畑${f.nearby.畑}筆　${src}`,
      );
  }
  const w = site.water;
  if (w) {
    const src = `出典：${GSI_VT_SOURCE.label} ${GSI_VT_SOURCE.url}`;
    if (w.status === "error") lines.push(`- 川・水路（地理院地図）：取得エラー（${w.error ?? ""}）`);
    else lines.push(`- 川・水路（地理院地図）：${w.insideWater ? "地点が水面の中" : w.nearestMeters !== null ? `最寄りの${w.nearestKind}まで約${w.nearestMeters}m` : `半径${w.radius}m以内に表示なし`}　${src}`);
  }
  if (site.derived.signals.floodRivers.length) lines.push(`- 浸水想定の対象河川（近くの川の名前の手がかり）：${site.derived.signals.floodRivers.join("、")}`);
  lines.push("- 注：地点はジオコーディングの代表点で、敷地の形・境界は反映していません。距離は数m〜十数mの誤差を含みます。");
  if (site.derived.kenpei || site.derived.yoseki) lines.push(`- 指定建蔽率／容積率：${site.derived.kenpei ?? "不明"}／${site.derived.yoseki ?? "不明"}`);
  for (const n of site.derived.notes) lines.push(`- 注記：${n}`);
  lines.push(`取得日時：${site.fetchedAt}`);
  return lines.join("\n");
}
