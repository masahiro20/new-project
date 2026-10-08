import type { Guide } from "./types";
import { guide as houkagoDay } from "./houkago-day";
import { guide as jidouHattatsu } from "./jidou-hattatsu";
import { guide as shuroB } from "./shuro-b";
import { guide as shuroA } from "./shuro-a";
import { guide as shuroIkou } from "./shuro-ikou";
import { guide as seikatsuKaigo } from "./seikatsu-kaigo";
import { guide as groupHome } from "./group-home";
import { guide as shisetsuNyusho } from "./shisetsu-nyusho";
import { guide as kyotakuKaigo } from "./kyotaku-kaigo";
import { guide as tankiNyusho } from "./tanki-nyusho";
import { guide as soudanShien } from "./soudan-shien";

/** One guide per service type, in the same order as SERVICE_TYPES in lib/form.ts. */
export const SERVICE_GUIDES: Guide[] = [
  houkagoDay,
  jidouHattatsu,
  shuroB,
  shuroA,
  shuroIkou,
  seikatsuKaigo,
  groupHome,
  shisetsuNyusho,
  kyotakuKaigo,
  tankiNyusho,
  soudanShien,
];
