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
import { guide as shidouShitekiJirei } from "./shidou-shiteki-jirei";
import { guide as gensanHayamihyo } from "./gensan-hayamihyo";
import { guide as gijirokuKakikata } from "./gijiroku-kakikata";
import { guide as shishinTsukurikata } from "./shishin-tsukurikata";
import { guide as bcpGensan } from "./bcp-gensan";
import { guide as houkagoDayShintaiKousokuRei } from "./houkago-day-shintai-kousoku-rei";
import { guide as reiwa9KaiteiJidou } from "./reiwa9-kaitei-jidou";
import { guide as gyakutaiKenshuShiryou } from "./gyakutai-kenshu-shiryou";
import { guide as kenshuRikaidoTest } from "./kenshu-rikaido-test";
import { guide as gyakutaiTantousha } from "./gyakutai-tantousha";
import { guide as iinkaiIttaiKaisai } from "./iinkai-ittai-kaisai";
import { guide as gyakutaiIinkaiKosei } from "./gyakutai-iinkai-kosei";
import { guide as uneiKiteiGyakutai } from "./unei-kitei-gyakutai";
import { guide as jidouHyoukaKouhyou } from "./jidou-hyouka-kouhyou";
import { guide as gensanKaizenKeikaku } from "./gensan-kaizen-keikaku";
import { guide as uneiShidouTsuchi } from "./unei-shidou-tsuchi";
import { guide as serufuChekku } from "./serufu-chekku";
import { guide as kansenTaisakuIinkai } from "./kansen-taisaku-iinkai";
import { guide as kobetsuShienKeikaku } from "./kobetsu-shien-keikaku";
import { guide as anzenKeikaku } from "./anzen-keikaku";
import { guide as hiyariHatto } from "./hiyari-hatto";

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

/** Long-tail topic guides (運営指導・早見表・書類の書き方), listed after the core explainers in lib/guides.ts. */
export const EXTRA_TOPIC_GUIDES: Guide[] = [
  gijirokuKakikata,
  houkagoDayShintaiKousokuRei,
  bcpGensan,
  gyakutaiKenshuShiryou,
  kenshuRikaidoTest,
  shishinTsukurikata,
  shidouShitekiJirei,
  reiwa9KaiteiJidou,
  gensanHayamihyo,
  gyakutaiTantousha,
  iinkaiIttaiKaisai,
  gyakutaiIinkaiKosei,
  uneiShidouTsuchi,
  jidouHyoukaKouhyou,
  uneiKiteiGyakutai,
  gensanKaizenKeikaku,
  serufuChekku,
  kansenTaisakuIinkai,
  kobetsuShienKeikaku,
  anzenKeikaku,
  hiyariHatto,
];
