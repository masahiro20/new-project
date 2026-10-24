// Extra land facts the 土地情報確認AIツール always reported: nearby 地価公示・地価調査
// points (their 水道・ガス・下水道 flags are the only public hint about utilities)
// and the ground elevation. Both are reference values for the area, not the site.

export const LANDPRICE_SOURCE = { label: "国土交通省 不動産情報ライブラリ 地価公示・地価調査", url: "https://www.reinfolib.mlit.go.jp/" };
export const ELEVATION_SOURCE = { label: "国土地理院 標高API（基盤地図情報 数値標高モデル）", url: "https://maps.gsi.go.jp/development/elevation_s.html" };

export type LandPricePoint = {
  meters: number;
  location: string;
  use: string;
  price: string;
  change?: string;
  water: boolean | null;
  gas: boolean | null;
  sewer: boolean | null;
  road?: string;
  zoning?: string;
  heightDistrict?: string;
  fire?: string;
  year: string;
};

export type LandPriceResult = { status: "ok" | "error" | "skipped"; year?: number; points: LandPricePoint[]; error?: string };
export type Elevation = { meters: number; source: string } | null;

const REINFOLIB = "https://www.reinfolib.mlit.go.jp/ex-api/external";

function tile(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x: Math.floor(fx), y: Math.floor(fy), px: (fx % 1) * 256, py: (fy % 1) * 256 };
}

export function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111_320;
  const dx = (lon2 - lon1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.round(Math.hypot(dx, dy));
}

/** "true" / true / "false" / false → boolean; anything else unknown. */
export const flag = (v: unknown): boolean | null => (v === true || v === "true" || v === "1" ? true : v === false || v === "false" || v === "0" ? false : null);

type PointFeature = { geometry: { type: string; coordinates: number[] } | null; properties: Record<string, unknown> | null };

/** The three nearest 地価公示・地価調査 points (this year, else the one or two before). */
export async function lookupLandPrices(lat: number, lon: number, key: string | undefined): Promise<LandPriceResult> {
  if (!key) return { status: "skipped", points: [] };
  const z = 13;
  const t = tile(lat, lon, z);
  const dx = t.px < 128 ? -1 : 1;
  const dy = t.py < 128 ? -1 : 1;
  const tiles = [
    [t.x, t.y],
    [t.x + dx, t.y],
    [t.x, t.y + dy],
    [t.x + dx, t.y + dy],
  ];
  const thisYear = new Date().getFullYear();
  try {
    for (const year of [thisYear, thisYear - 1, thisYear - 2]) {
      const fcs = await Promise.all(
        tiles.map(async ([x, y]) => {
          const res = await fetch(`${REINFOLIB}/XPT002?response_format=geojson&z=${z}&x=${x}&y=${y}&year=${year}`, {
            headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" },
            signal: AbortSignal.timeout(15000),
          });
          if (res.status === 404) return [] as PointFeature[];
          if (!res.ok) throw new Error(`XPT002 ${res.status}`);
          const text = await res.text();
          if (!text.trim()) return [] as PointFeature[];
          const data = JSON.parse(text) as { features?: PointFeature[] } | unknown[];
          return Array.isArray(data) ? [] : (data.features ?? []);
        }),
      );
      const features = fcs.flat().filter((f) => f.geometry?.type === "Point");
      if (features.length === 0) continue;
      const seen = new Set<string>();
      const points = features
        .map((f) => {
          const [plon, plat] = f.geometry!.coordinates;
          return { p: f.properties ?? {}, d: metersBetween(lat, lon, plat, plon) };
        })
        .sort((a, b) => a.d - b.d)
        .filter(({ p }) => {
          const k = String(p.location ?? p.point_id ?? "");
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 3)
        .map(({ p, d }): LandPricePoint => ({
          meters: d,
          location: String(p.location ?? p.location_number_ja ?? ""),
          use: String(p.use_category_name_ja ?? ""),
          price: String(p.u_current_years_price_ja ?? ""),
          change: p.year_on_year_change_rate != null ? `${p.year_on_year_change_rate}%` : undefined,
          water: flag(p.water_supply_availability),
          gas: flag(p.gas_supply_availability),
          sewer: flag(p.sewer_supply_availability),
          road: p.front_road_condition ? String(p.front_road_condition) : undefined,
          zoning: p.regulations_use_category_name_ja ? String(p.regulations_use_category_name_ja) : undefined,
          heightDistrict: p.regulations_altitude_district_name_ja ? String(p.regulations_altitude_district_name_ja) : undefined,
          fire: p.regulations_fireproof_name_ja ? String(p.regulations_fireproof_name_ja) : undefined,
          year: String(p.target_year_name_ja ?? year),
        }));
      return { status: "ok", year, points };
    }
    return { status: "ok", points: [] };
  } catch (e) {
    return { status: "error", points: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function lookupElevation(lat: number, lon: number): Promise<Elevation> {
  try {
    const res = await fetch(`https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon}&lat=${lat}&outtype=JSON`, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { elevation: number | string; hsrc?: string };
    if (j.elevation === "-----" || j.elevation === "" || Number.isNaN(Number(j.elevation))) return null;
    return { meters: Math.round(Number(j.elevation) * 10) / 10, source: j.hsrc ?? "" };
  } catch {
    return null;
  }
}
