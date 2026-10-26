// 道路（地図上の見込み）：国土地理院 最適化ベクトルタイル（地図情報レベル2500）の
// 道路中心線（種別・幅員区分・幅員）と道路縁から、敷地のまわりの道路を拾う。
// 建築基準法上の道路か（42条の項・号）、認定幅員・境界は分からないので、結果はすべて「推測」。

import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { cached, fetchWithTimeout, tilesAround } from "./nearby";

const GSI_OPT = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1";
const ZOOM = 16;
const RADIUS_M = 35;

export const ROAD_SOURCE = {
  label: "国土地理院 最適化ベクトルタイル（道路中心線・道路縁）",
  url: "https://maps.gsi.go.jp/development/vt.html",
  year: "最新",
};

export type NearRoad = {
  /** 国道・都道府県道・市区町村道等（「等」は私道・農道などを含む）。 */
  kind: string;
  /** 幅員区分（地図の分類。例：3m-5.5m未満）。 */
  rankWidth: string;
  /** 道路縁どうしの距離から測った幅（m）。 */
  edgeWidthM: number | null;
  /** 住所の代表点から道路中心線までの距離（m）。 */
  distanceM: number;
  /** 代表点から見た方位（北・北東…）。 */
  direction: string;
};
export type RoadResult = { status: "ok" | "error"; roads: NearRoad[]; radius: number; error?: string };

type Pt = [number, number];
type Line = { coords: Pt[]; props: Record<string, unknown> };

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
const direction = (dx: number, dy: number) => DIRS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 / 45) % 8];

/** Nearest point on a polyline (local metres). */
function nearestOn(p: Pt, path: Pt[]): { d: number; q: Pt; seg: [Pt, Pt] } | null {
  let best: { d: number; q: Pt; seg: [Pt, Pt] } | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
    const q: Pt = [a[0] + t * vx, a[1] + t * vy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { d, q, seg: [a, b] };
  }
  return best;
}

/** Distance along the ray q + t·n (t>0 and t<0) to the nearest edge line, within max metres. */
function edgeWidth(q: Pt, n: Pt, edges: Pt[][], max = 25): number | null {
  let pos = Infinity;
  let neg = Infinity;
  for (const path of edges)
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = n[0] * ey - n[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - q[0]) * ey - (a[1] - q[1]) * ex) / den;
      const s = ((a[0] - q[0]) * n[1] - (a[1] - q[1]) * n[0]) / den;
      if (s < 0 || s > 1 || Math.abs(t) > max) continue;
      if (t > 0.2) pos = Math.min(pos, t);
      else if (t < -0.2) neg = Math.min(neg, -t);
    }
  return Number.isFinite(pos) && Number.isFinite(neg) ? Math.round((pos + neg) * 10) / 10 : null;
}

/** Pure analysis on local metre coordinates (site at 0,0); exported for tests. */
export function analyzeRoads(centerlines: Line[], edges: Pt[][], radius = RADIUS_M): NearRoad[] {
  const found: (NearRoad & { q: Pt })[] = [];
  for (const l of centerlines) {
    const n = nearestOn([0, 0], l.coords);
    if (!n || n.d > radius) continue;
    const [a, b] = n.seg;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const normal: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    found.push({
      kind: String(l.props.vt_rdctg ?? "道路"),
      rankWidth: String(l.props.vt_rnkwidth ?? ""),
      edgeWidthM: edgeWidth(n.q, normal, edges),
      distanceM: Math.round(n.d),
      direction: n.d < 0.5 ? "敷地上" : direction(n.q[0], n.q[1]),
      q: n.q,
    });
  }
  found.sort((x, y) => x.distanceM - y.distanceM);
  // One entry per road: drop pieces whose nearest point is within 6m of a closer one.
  const out: (NearRoad & { q: Pt })[] = [];
  for (const r of found) if (!out.some((o) => Math.hypot(o.q[0] - r.q[0], o.q[1] - r.q[1]) < 6)) out.push(r);
  return out.slice(0, 3).map(({ q: _q, ...r }) => r);
}

type GeoLine = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };

async function tileLines(x: number, y: number): Promise<{ cl: GeoLine[]; edge: GeoLine[] }> {
  return cached(`gsiopt:${x}/${y}`, async () => {
    const res = await fetchWithTimeout(`${GSI_OPT}/${ZOOM}/${x}/${y}.pbf`);
    if (res.status === 404) return { cl: [], edge: [] };
    if (!res.ok) throw new Error(`地理院ベクトルタイル ${res.status}`);
    const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    const read = (name: string) => {
      const layer = tile.layers[name];
      const out: GeoLine[] = [];
      if (layer) for (let i = 0; i < layer.length; i++) out.push(layer.feature(i).toGeoJSON(x, y, ZOOM) as unknown as GeoLine);
      return out;
    };
    return { cl: read("RdCL"), edge: read("RdEdg") };
  });
}

export async function lookupRoads(lat: number, lon: number): Promise<RoadResult> {
  try {
    const tiles = tilesAround(lat, lon, ZOOM, RADIUS_M + 30);
    const lists = await Promise.all(tiles.map((t) => tileLines(t.x, t.y)));
    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110540;
    const local = (c: number[]): Pt => [(c[0] - lon) * kx, (c[1] - lat) * ky];
    const paths = (g: GeoLine["geometry"]): Pt[][] =>
      g.type === "LineString" ? [(g.coordinates as number[][]).map(local)] : g.type === "MultiLineString" ? (g.coordinates as number[][][]).map((p) => p.map(local)) : [];
    const centerlines: Line[] = lists.flatMap((l) => l.cl.flatMap((f) => paths(f.geometry).map((coords) => ({ coords, props: f.properties }))));
    const edges = lists.flatMap((l) => l.edge.flatMap((f) => paths(f.geometry)));
    return { status: "ok", roads: analyzeRoads(centerlines, edges), radius: RADIUS_M };
  } catch (e) {
    return { status: "error", roads: [], radius: RADIUS_M, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 一行の説明（例：南側 約6m先・市区町村道等・幅の区分 3m-5.5m未満（道路縁の間 約4.2m））。 */
export function roadLine(r: NearRoad): string {
  const where = r.direction === "敷地上" ? "代表点のすぐそば" : `${r.direction}側 約${r.distanceM}m先`;
  const width = [r.rankWidth ? `幅の区分 ${r.rankWidth}` : "", r.edgeWidthM !== null ? `道路縁の間 約${r.edgeWidthM}m` : ""].filter(Boolean).join("・");
  return `${where}・${r.kind}${width ? `・${width}` : ""}`;
}
