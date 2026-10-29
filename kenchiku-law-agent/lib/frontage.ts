// 接道の見込み：登記所備付地図の筆の形（緯度経度）と、国土地理院の道路縁・道路中心線を重ね、
// 筆の境界のうち道路に面している部分の長さと方位を測る。どちらの地図にも数十cm〜1m程度の
// ずれがあり、2項道路の後退・隅切り・水路は分からないので結果は「推測」。

import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { cached, fetchWithTimeout, tilesAround } from "./nearby";

const GSI_OPT = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1";
const ZOOM = 16;
/** 筆の境界と道路縁がこの距離以内なら「道路に面している」とみなす（m）。 */
const EDGE_TOL = 1.5;
/** 道路中心線を探す距離（m）。 */
const CL_MAX = 15;
const STEP = 0.5;

type Pt = [number, number];
export type FrontageSide = { direction: string; lengthM: number; kind: string; rankWidth: string };
export type Frontage = {
  status: "ok" | "error";
  totalM: number;
  sides: FrontageSide[];
  /** 一番長く道路に面する辺から見た敷地の奥行（m）。 */
  depthM?: number;
  error?: string;
};

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
const dirOf = (dx: number, dy: number) => DIRS[Math.round((((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) / 45) % 8];

function segNearest(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  const q: Pt = [a[0] + t * vx, a[1] + t * vy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

function nearestOnPaths(p: Pt, paths: { coords: Pt[]; i: number }[]): { d: number; q: Pt; i: number; dir: Pt } | null {
  let best: { d: number; q: Pt; i: number; dir: Pt } | null = null;
  for (const path of paths)
    for (let k = 0; k < path.coords.length - 1; k++) {
      const a = path.coords[k];
      const b = path.coords[k + 1];
      const n = segNearest(p, a, b);
      if (!best || n.d < best.d) {
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        best = { ...n, i: path.i, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
      }
    }
  return best;
}

/** |cos| of the angle between two unit directions (1 = parallel). */
const parallel = (u: Pt, v: Pt) => Math.abs(u[0] * v[0] + u[1] * v[1]);

function inside(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Pure measurement on local metre coordinates: walks the lot boundary in STEP pieces and
 * keeps a piece when a road edge runs along it and a road centerline lies just outside the lot.
 */
export function measureFrontage(ring: Pt[], centerlines: { coords: Pt[]; props: Record<string, unknown> }[], edges: Pt[][]): Omit<Frontage, "status"> {
  const cls = centerlines.map((c, i) => ({ coords: c.coords, i }));
  const eds = edges.map((coords, i) => ({ coords, i }));
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
  const bySide = new Map<string, FrontageSide>();
  for (let k = 0; k < closed.length - 1; k++) {
    const a = closed[k];
    const b = closed[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const n = Math.max(1, Math.round(len / STEP));
    const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const e = nearestOnPaths(p, eds);
      // The boundary has to run along the road edge (within ~30°), not just touch it at a corner.
      if (!e || e.d > EDGE_TOL || parallel(u, e.dir) < 0.87) continue;
      const c = nearestOnPaths(p, cls);
      if (!c || c.d > CL_MAX || inside(c.q, closed)) continue;
      const dir = dirOf(c.q[0] - p[0], c.q[1] - p[1]);
      const props = centerlines[c.i].props;
      const key = `${dir}|${c.i}`;
      const cur = bySide.get(key) ?? { direction: dir, lengthM: 0, kind: String(props.vt_rdctg ?? "道路"), rankWidth: String(props.vt_rnkwidth ?? "") };
      cur.lengthM += len / n;
      bySide.set(key, cur);
    }
  }
  // Merge pieces on the same side and road kind; drop slivers under 1m (corners, noise).
  const merged = new Map<string, FrontageSide>();
  for (const s of bySide.values()) {
    const key = `${s.direction}|${s.kind}|${s.rankWidth}`;
    const m = merged.get(key) ?? { ...s, lengthM: 0 };
    m.lengthM += s.lengthM;
    merged.set(key, m);
  }
  const sides = [...merged.values()].filter((s) => s.lengthM >= 1).map((s) => ({ ...s, lengthM: Math.round(s.lengthM * 10) / 10 }));
  sides.sort((x, y) => y.lengthM - x.lengthM);
  // Depth: the lot's extent along the direction of the main frontage (toward the road).
  let depthM: number | undefined;
  if (sides.length) {
    const a = (DIRS.indexOf(sides[0].direction) * 45 * Math.PI) / 180;
    const proj = closed.map((p) => p[0] * Math.sin(a) + p[1] * Math.cos(a));
    depthM = Math.round((Math.max(...proj) - Math.min(...proj)) * 10) / 10;
  }
  return { totalM: Math.round(sides.reduce((t, s) => t + s.lengthM, 0) * 10) / 10, sides, depthM };
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

/** ring: the lot outline in [lon, lat]. */
export async function lookupFrontage(ring: [number, number][]): Promise<Frontage> {
  try {
    const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const ky = 110540;
    const local = (c: number[]): Pt => [(c[0] - lon0) * kx, (c[1] - lat0) * ky];
    const radius = Math.max(...ring.map((p) => Math.hypot(...local(p)))) + CL_MAX + 10;
    const lists = await Promise.all(tilesAround(lat0, lon0, ZOOM, radius).map((t) => tileLines(t.x, t.y)));
    const paths = (g: GeoLine["geometry"]): Pt[][] =>
      g.type === "LineString" ? [(g.coordinates as number[][]).map(local)] : g.type === "MultiLineString" ? (g.coordinates as number[][][]).map((p) => p.map(local)) : [];
    const centerlines = lists.flatMap((l) => l.cl.flatMap((f) => paths(f.geometry).map((coords) => ({ coords, props: f.properties }))));
    const edges = lists.flatMap((l) => l.edge.flatMap((f) => paths(f.geometry)));
    return { status: "ok", ...measureFrontage(ring.map(local), centerlines, edges) };
  } catch (e) {
    return { status: "error", totalM: 0, sides: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function frontageLine(f: Frontage): string {
  if (f.status !== "ok") return "測れませんでした";
  if (!f.sides.length) return "地図上、道路に面した辺が見つかりません（旗竿地・通路・私道・水路越しの可能性）";
  return `${f.sides.map((s) => `${s.direction}側 約${s.lengthM}m（${s.kind}${s.rankWidth ? `・幅 ${s.rankWidth}` : ""}）`).join("・")}　計 約${f.totalM}m`;
}
