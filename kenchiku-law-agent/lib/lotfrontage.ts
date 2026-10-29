// 筆（公図・地番図）から接道の見込みを測る。API と MCP の両方で使う（サーバー側のみ）。

import { lookupChiban, type ChibanResult } from "./chiban";
import { lookupFrontage, type Frontage } from "./frontage";
import { normalizeDistrict, type KozuResult } from "./kozu";

export type LotFrontage = Frontage & { lot: string };

/** 公図が公共座標なら同じ地番の筆を地番図（緯度経度）で引き直し、なければ代表点を含む筆で測る。 */
export async function frontageForLot(lat: number, lon: number, kozu: KozuResult | null, chiban: ChibanResult | null): Promise<LotFrontage | null> {
  let lot: { label: string; ring: [number, number][] } | null = null;
  if (kozu?.status === "ok" && kozu.map && !/任意/.test(kozu.map.coord)) {
    const main = kozu.lots.find((l) => l.main);
    if (main) {
      const near = await lookupChiban(lat, lon);
      const num = (s: string) => s.replace(/[^\d-]/g, "");
      const same = near.lots.filter((l) => num(l.chiban) === num(main.chiban));
      const district = normalizeDistrict(kozu.district ?? "");
      const hit = same.find((l) => district.includes(normalizeDistrict(l.oaza)) || normalizeDistrict(l.oaza).includes(district)) ?? (same.length === 1 ? same[0] : undefined);
      if (hit) lot = { label: `${hit.oaza}${hit.chiban}`, ring: hit.ring };
    }
  } else if (chiban?.status === "ok") {
    const hit = chiban.lots.find((l) => l.contains);
    if (hit) lot = { label: `${hit.oaza}${hit.chiban}（住所の代表点を含む筆）`, ring: hit.ring };
  }
  return lot ? { ...(await lookupFrontage(lot.ring)), lot: lot.label } : null;
}
