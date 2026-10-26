// Two lookups that catch what designers and sales staff most often miss on a
// rural or riverside lot, using public data that needs no API key:
//
// - 農地: 農林水産省「筆ポリゴン」(ArcGIS Online の公式配信, 毎年公開). Each
//   polygon is a parcel judged to be farmland (田/畑) from aerial imagery, so it
//   reflects the *current* use — which is what 農地法 looks at, not the
//   registered 地目.
// - 川・水路: 国土地理院ベクトルタイル (experimental_bvmap z16, 地図情報レベル2500).
//   We measure the distance from the point to the nearest water line / water
//   area. River names are not in the tiles; the flood-zone layer supplies them
//   when the lot is in a 洪水浸水想定区域.

import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const FUDE = "https://services8.arcgis.com/cW9ZoPyzxXOxrpu1/arcgis/rest/services/FudePolygonTemp_2026/FeatureServer/0/query";
const GSI_VT = "https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap";
const VT_ZOOM = 16;
const FARM_RADIUS_M = 60;
const WATER_RADIUS_M = 150;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const FUDE_SOURCE = {
  label: "農林水産省 農地の区画情報（筆ポリゴン）2026年公開",
  url: "https://www.maff.go.jp/j/tokei/porigon/index.html",
  year: "2026年公開",
};
export const GSI_VT_SOURCE = {
  label: "国土地理院 地理院地図Vector（水涯線・河川中心線・水域）",
  url: "https://maps.gsi.go.jp/development/vt.html",
  year: "最新",
};

export type FarmlandResult = {
  status: "ok" | "error";
  /** Land type of the parcel polygon containing the point, if any. */
  onSite: "田" | "畑" | null;
  /** Distance in metres to the nearest farmland parcel (0 when on it); null when none within the radius. */
  nearestMeters: number | null;
  /** Parcels within FARM_RADIUS_M, by type. */
  nearby: { 田: number; 畑: number };
  radius: number;
  error?: string;
};

export type WaterResult = {
  status: "ok" | "error";
  /** Distance in metres to the nearest water line or area; null when none within the radius. */
  nearestMeters: number | null;
  /** What the nearest feature is, in words. */
  nearestKind: string | null;
  /** True when the point itself falls inside a mapped water area. */
  insideWater: boolean;
  radius: number;
  error?: string;
};

type Ring = number[][];

const KX = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
const KY = 110540;

function segDist(lon: number, lat: number, a: number[], b: number[]): number {
  const kx = KX(lat);
  const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * KY;
  const bx = (b[0] - lon) * kx, by = (b[1] - lat) * KY;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distanceToPath(lon: number, lat: number, path: number[][]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, segDist(lon, lat, path[i - 1], path[i]));
  if (path.length === 1) best = segDist(lon, lat, path[0], path[0]);
  return best;
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance to a polygon (0 inside). `rings[0]` is the outer ring. */
export function distanceToPolygon(lon: number, lat: number, rings: Ring[]): number {
  if (rings.length === 0) return Infinity;
  if (inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h))) return 0;
  return Math.min(...rings.map((r) => distanceToPath(lon, lat, r)));
}

const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ farmland

type FudeFeature = { geometry: { type: string; coordinates: unknown } | null; properties: { land_type?: number } | null };

function polygonsOf(g: FudeFeature["geometry"]): Ring[][] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Ring[]];
  if (g.type === "MultiPolygon") return g.coordinates as Ring[][];
  return [];
}

export function summarizeFarmland(lon: number, lat: number, features: FudeFeature[], radius = FARM_RADIUS_M): FarmlandResult {
  const out: FarmlandResult = { status: "ok", onSite: null, nearestMeters: null, nearby: { 田: 0, 畑: 0 }, radius };
  for (const f of features) {
    const type = f.properties?.land_type === 100 ? "田" : f.properties?.land_type === 200 ? "畑" : null;
    if (!type) continue;
    const d = Math.min(...polygonsOf(f.geometry).map((rings) => distanceToPolygon(lon, lat, rings)));
    if (!Number.isFinite(d) || d > radius) continue;
    out.nearby[type] += 1;
    if (d === 0 && !out.onSite) out.onSite = type;
    if (out.nearestMeters === null || d < out.nearestMeters) out.nearestMeters = Math.round(d);
  }
  return out;
}

export async function lookupFarmland(lat: number, lon: number): Promise<FarmlandResult> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(FARM_RADIUS_M),
    units: "esriSRUnit_Meter",
    outFields: "land_type",
    returnGeometry: "true",
    f: "geojson",
  });
  try {
    return await cached(`fude:${lat.toFixed(6)},${lon.toFixed(6)}`, async () => {
      const res = await fetchWithTimeout(`${FUDE}?${params}`);
      if (!res.ok) throw new Error(`筆ポリゴン ${res.status}`);
      const data = (await res.json()) as { features?: FudeFeature[]; error?: { message?: string } };
      if (data.error) throw new Error(`筆ポリゴン ${data.error.message ?? "error"}`);
      return summarizeFarmland(lon, lat, data.features ?? []);
    });
  } catch (e) {
    return { status: "error", onSite: null, nearestMeters: null, nearby: { 田: 0, 畑: 0 }, radius: FARM_RADIUS_M, error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------ water

/** Tiles at `z` whose area lies within `radius` metres of the point. */
export function tilesAround(lat: number, lon: number, z: number, radius: number): { x: number; y: number }[] {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tileMeters = (40075016.686 * Math.cos(rad)) / n;
  const r = radius / tileMeters;
  const xs = new Set([Math.floor(fx - r), Math.floor(fx), Math.floor(fx + r)]);
  const ys = new Set([Math.floor(fy - r), Math.floor(fy), Math.floor(fy + r)]);
  const out: { x: number; y: number }[] = [];
  for (const x of xs) for (const y of ys) out.push({ x, y });
  return out;
}

const WATER_KIND: Record<number, string> = {
  5000: "水域（川・池・水路の水面）",
  5201: "川の水涯線（岸の線）",
  5203: "川の水涯線（岸の線）",
  5301: "細い川・水路（河川中心線）",
  5302: "細い川・水路（河川中心線）",
  5321: "水路（河川中心線）",
  5322: "水路（河川中心線）",
};

type GeoFeature = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };

export function nearestWater(lon: number, lat: number, features: GeoFeature[], radius = WATER_RADIUS_M): WaterResult {
  let best: { d: number; kind: string } | null = null;
  let insideWater = false;
  for (const f of features) {
    const code = Number(f.properties.ftCode);
    const kind = WATER_KIND[code] ?? "川・水路・池";
    const g = f.geometry;
    let d = Infinity;
    if (g.type === "LineString") d = distanceToPath(lon, lat, g.coordinates as number[][]);
    else if (g.type === "MultiLineString") d = Math.min(...(g.coordinates as number[][][]).map((p) => distanceToPath(lon, lat, p)));
    else if (g.type === "Polygon") d = distanceToPolygon(lon, lat, g.coordinates as Ring[]);
    else if (g.type === "MultiPolygon") d = Math.min(...(g.coordinates as Ring[][]).map((p) => distanceToPolygon(lon, lat, p)));
    if (d === 0 && (g.type === "Polygon" || g.type === "MultiPolygon")) insideWater = true;
    if (d <= radius && (!best || d < best.d)) best = { d, kind };
  }
  return { status: "ok", nearestMeters: best ? Math.round(best.d) : null, nearestKind: best?.kind ?? null, insideWater, radius };
}

async function waterFeaturesForTile(x: number, y: number): Promise<GeoFeature[]> {
  return cached(`gsivt:${x}/${y}`, async () => {
    const res = await fetchWithTimeout(`${GSI_VT}/${VT_ZOOM}/${x}/${y}.pbf`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`地理院ベクトルタイル ${res.status}`);
    const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    const out: GeoFeature[] = [];
    for (const name of ["river", "waterarea", "lake"]) {
      const layer = tile.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const gj = layer.feature(i).toGeoJSON(x, y, VT_ZOOM) as unknown as GeoFeature;
        out.push(gj);
      }
    }
    return out;
  });
}

export async function lookupWater(lat: number, lon: number): Promise<WaterResult> {
  try {
    const tiles = tilesAround(lat, lon, VT_ZOOM, WATER_RADIUS_M);
    const lists = await Promise.all(tiles.map((t) => waterFeaturesForTile(t.x, t.y)));
    return nearestWater(lon, lat, lists.flat());
  } catch (e) {
    return { status: "error", nearestMeters: null, nearestKind: null, insideWater: false, radius: WATER_RADIUS_M, error: e instanceof Error ? e.message : String(e) };
  }
}
