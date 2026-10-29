// よく扱う市の窓口と公開地図（2026年10月に各市・愛知県・東邦ガスの公式ページで確認）。
// 役所調査の各カードで、検索リンクの代わりに直接のリンク・担当課・電話・注意点を出す。
// URL や電話番号は変わるので、半年に一度は見直す（VERIFIED_AT）。

export const VERIFIED_AT = "2026-10-29";

export type MuniLink = { label: string; url: string };
export type MuniOffice = {
  /** 担当課（正式名）。 */
  office: string;
  phone?: string;
  /** ネットで見られるか（true＝公開あり、false＝窓口のみ）。 */
  online: boolean | null;
  links: MuniLink[];
  /** 分かること・分からないこと・使い方の注意。 */
  note: string;
};
export type Municipality = {
  city: string;
  /** 建築確認の特定行政庁（誰が審査するか）。 */
  tokutei: string;
  road: MuniOffice;
  ledger: MuniOffice;
  water: MuniOffice;
  sewer: MuniOffice;
  gas: MuniOffice;
  /** 都市計画（用途地域など）の公開地図。 */
  planMap?: MuniLink;
};

const AICHI_KAKUNIN = "愛知県 建築局 建築指導課分室 確認第一グループ（東大手庁舎3階・052-961-9720）";
const TOHO_GAS: MuniOffice = {
  office: "東邦ガスネットワーク",
  online: true,
  links: [{ label: "都市ガス本支管埋設状況問い合わせ（Web・登録制）", url: "https://www.tohogas.co.jp/nw/important-announcement/1245223_2456.html" }],
  note: "不動産取引向けの本支管の照会はWeb（ユーザー登録制）。電話・FAXの照会は終了。道路工事の照会は他工事受付センター 052-872-9556。",
};

export const MUNICIPALITIES: Municipality[] = [
  {
    city: "小牧市",
    tokutei: `限定特定行政庁：木造2階以下・延べ300㎡以下・高さ16m以下などは小牧市 建築課（0568-76-1142）、それ以外は${AICHI_KAKUNIN}`,
    road: {
      office: "小牧市 建設部 建築課 建築係（東庁舎1階）",
      phone: "0568-76-1142",
      online: false,
      links: [{ label: "小牧市 事前調査（窓口一覧）", url: "https://www.city.komaki.aichi.jp/admin/soshiki/kensetsubu/kenchiku/2/7/1/1/3680.html" }],
      note: "指定道路図のネット公開なし。位置指定道路・2項道路は建築課。幅4m未満の道に接するときは建築課に事前相談し、確認申請の前に道路課宛ての事前協議書が必要。電話では確認番号などに答えない。",
    },
    ledger: {
      office: "小牧市 建設部 道路課 維持係",
      phone: "0568-76-1174",
      online: true,
      links: [{ label: "小牧市道路線認定図・認定路線調書（PDF）", url: "https://www.city.komaki.aichi.jp/admin/shisei/shisei/dourokasen/2/22552.html" }],
      note: "認定路線調書の幅員は台帳上の数字で、建築基準法上の幅員ではない。官民境界は道路課 用地係（ページにより0568-76-1186／1150）、区画整理地内は区画整理課（0568-76-1159）。",
    },
    water: {
      office: "小牧市 上下水道部 上下水道業務課 給水係（古雅四丁目117 上水道管理センター内）",
      phone: "0568-79-1314",
      online: true,
      links: [
        { label: "上水道配管図（PDF・本管のみ）", url: "https://www.city.komaki.aichi.jp/admin/soshiki/jogesuido/jyogesuido/jigyosya/36829.html" },
        { label: "埋設調査の依頼フォーム", url: "https://logoform.jp/form/uSYk/383539" },
      ],
      note: "配管図は本管のみ。給水管（引込管）は利用者の所有物で図に載っていない。引込状況・本管の出幅・深さは埋設調査（窓口・フォーム・FAX 0568-79-1239、回答は電話のみ）。",
    },
    sewer: {
      office: "小牧市 上下水道部 上下水道業務課 排水係",
      phone: "0568-79-1407",
      online: true,
      links: [
        { label: "下水道台帳（小牧市地図情報）の案内", url: "https://www.city.komaki.aichi.jp/admin/soshiki/jogesuido/jyogesuido/jigyosya/47437.html" },
        { label: "公共下水道 供用開始区域図", url: "https://www.city.komaki.aichi.jp/admin/soshiki/jogesuido/jyogesuido/annai/komagesui14/33093.html" },
      ],
      note: "市の公開GISで本管・取付管・汚水公共ます（最終ます）が見られる（利用上の注意に同意）。前面道路に本管があっても接続できない場合がある。供用開始前でも接続できる地域があるので排水係に確認。",
    },
    gas: { ...TOHO_GAS, note: `市の北東部（大山・野口・大草・林の一部）を除き東邦ガスの供給区域。${TOHO_GAS.note}` },
    planMap: { label: "小牧市地図情報（公開GIS・用途地域）", url: "https://webgis.alandis.jp/komaki23/portal/contents/index.html" },
  },
  {
    city: "春日井市",
    tokutei: "春日井市（特定行政庁）まちづくり推進部 建築指導課（0568-85-6324）",
    road: {
      office: "春日井市 まちづくり推進部 建築指導課",
      phone: "0568-85-6328",
      online: false,
      links: [{ label: "春日井市 協議先一覧（道路の種別は建築指導課）", url: "https://www.city.kasugai.lg.jp/shisei/machi/kenchiku/1008883.html" }],
      note: "指定道路図のネット公開なし。2項道路に接する敷地は、土木管理課の狭あい道路拡幅整備要綱の手順を踏んでから確認申請。",
    },
    ledger: {
      office: "春日井市 建設部 土木管理課（市役所7階）",
      phone: "0568-85-6272",
      online: true,
      links: [{ label: "道路台帳平面図（道風くんの春日井まっぷ）の案内", url: "https://www.city.kasugai.lg.jp/shisei/machi/douro/1027648/index.html" }],
      note: "市の地図サイト「道風くんの春日井まっぷ」→まちづくり情報→道路台帳平面図で路線名（認定番号）と幅員が見られる（利用条件に同意）。電話での問い合わせは不可、窓口でも閲覧可。",
    },
    water: {
      office: "春日井市 上下水道部 上下水道業務課",
      phone: "0568-85-6418",
      online: true,
      links: [{ label: "上水道管路図・下水道台帳図の閲覧", url: "https://www.city.kasugai.lg.jp/kurashi/1020797/1020872/1025148/index.html" }],
      note: "管路図は規約に同意し、毎回所属・目的を入力（市のページから入らないとエラー）。本管の出幅・深さは水道工務課 0568-85-6421。引込口径・メーター口径は住宅地図に住所と折返し番号を書いてFAX 0568-85-6258。埋設管照会窓口 0568-85-6033。",
    },
    sewer: {
      office: "春日井市 上下水道部 上下水道業務課",
      phone: "0568-85-6418",
      online: true,
      links: [
        { label: "下水道台帳図（道風くんの春日井まっぷ）", url: "https://www.city.kasugai.lg.jp/kurashi/1020797/1020872/1025148/index.html" },
        { label: "供用開始状況一覧・位置図", url: "https://www.city.kasugai.lg.jp/kurashi/1020797/1020885/1021181/1021665.html" },
      ],
      note: "下水道台帳図は市の地図サイトで閲覧（利用条件に同意）。供用区域は一覧表と位置図PDF（0568-85-6349）。",
    },
    gas: { ...TOHO_GAS, note: `内津町を除き東邦ガスの供給区域。${TOHO_GAS.note}` },
    planMap: { label: "道風くんの春日井まっぷ（都市計画情報）", url: "https://www2.wagmap.jp/kasugai/Portal" },
  },
  {
    city: "犬山市",
    tokutei: `${AICHI_KAKUNIN}（申請は犬山市を経由。検査・許可は愛知県尾張建設事務所 建築課 052-253-5425）`,
    road: {
      office: "犬山市 都市整備部 都市計画課 建築指導担当（本庁舎2階）",
      phone: "0568-44-0331",
      online: false,
      links: [{ label: "確認申請の調査書・道路後退の届出", url: "https://www.city.inuyama.aichi.jp/online/shinsei/1001354.html" }],
      note: "指定道路図のネット公開なし。確認申請に付ける調査書で、建築基準法の道路（位置指定）は都市計画課が、道路種別と台帳幅員は土木管理課が確認する。",
    },
    ledger: {
      office: "犬山市 都市整備部 土木管理課（本庁舎2階）",
      phone: "0568-44-0334",
      online: true,
      links: [{ label: "わんマップ（市道の路線名・幅員）の案内", url: "https://www.city.inuyama.aichi.jp/kurashi/sumai/1007187.html" }],
      note: "市の地図サイト「わんマップ」で市道の路線名・道路幅員が見られる（市の案内）。境界確定は土木管理課。",
    },
    water: {
      office: "犬山市 都市整備部 水道課 給水担当（本庁舎2階）",
      phone: "0568-62-9300",
      online: false,
      links: [{ label: "水道課（給水装置工事）", url: "https://www.city.inuyama.aichi.jp/kurashi/shinyou/1000688/1000699.html" }],
      note: "配水管図・給水装置図のネット公開は見当たらない。本管の管種・口径と引込の有無は給水担当に照会。",
    },
    sewer: {
      office: "犬山市 都市整備部 下水道課（本庁舎2階）",
      phone: "0568-44-0337",
      online: false,
      links: [{ label: "公共下水道区域図（PDF）", url: "https://www.city.inuyama.aichi.jp/kurashi/shinyou/1000701/1000703.html" }],
      note: "区域図はPDFで公開。下水道台帳（管路・公共桝）のネット公開は見当たらないので下水道課に照会。",
    },
    gas: {
      office: "東邦ガスネットワーク（市の一部のみ）",
      online: true,
      links: TOHO_GAS.links,
      note: "東邦ガスの供給は市内の一部（善師野・前田面ほか名鉄広見線以北など）のみ。それ以外は別事業者かプロパンの可能性があるので現地のメーター・ボンベで確認。",
    },
    planMap: { label: "わんマップ（都市計画・用途地域）", url: "http://webgis.alandis.jp/inuyama23/portal/top/" },
  },
  {
    city: "江南市",
    tokutei: `限定特定行政庁：小規模建築物は江南市 建築課 建築指導グループ（0587-50-0287）、それ以外は${AICHI_KAKUNIN}（申請は市を経由）`,
    road: {
      office: "江南市 都市整備部 建築課 建築指導グループ",
      phone: "0587-50-0287",
      online: false,
      links: [{ label: "道路台帳図（建築基準法上の道路種別は建築課）", url: "https://www.city.konan.lg.jp/kurashi/douro/1005935/1019718/index.html" }],
      note: "指定道路図のネット公開なし。市は原則として幅員1.8m以上4m未満の市道を2項道路として扱う。国道・県道は愛知県一宮建設事務所 0586-72-1411。",
    },
    ledger: {
      office: "江南市 都市整備部 土木課",
      phone: "0587-54-1111（代表）",
      online: true,
      links: [{ label: "道路台帳図（区画ごとのPDF）", url: "https://www.city.konan.lg.jp/kurashi/douro/1005935/1019718/index.html" }],
      note: "利用条件に同意して区画ごとのPDFを閲覧。前年度データで最新の認定・廃止が反映されていないことがある。境界確定の立会資料は土木課窓口のみ。",
    },
    water: {
      office: "江南市 水道部 水道課（般若町中山146）",
      phone: "0587-53-3511",
      online: true,
      links: [
        { label: "上水道管理図（配水管・PDF）", url: "https://www.city.konan.lg.jp/kurashi/suido/1003554/1003564.html" },
        { label: "給水装置の情報（窓口申請）", url: "https://www.city.konan.lg.jp/kurashi/suido/1003554/1006428/1003570.html" },
      ],
      note: "配水管は1/1000のPDFで公開。給水装置（引込み）の情報は窓口のみで、本人確認書類が必要、所有者以外は委任状が要る。",
    },
    sewer: {
      office: "江南市 水道部 下水道課",
      phone: "0587-54-1111（代表）",
      online: true,
      links: [
        { label: "公共下水道台帳平面図（PDF）", url: "https://www.city.konan.lg.jp/kurashi/suido/1003555/1003588/1003608.html" },
        { label: "供用区域・整備予定区域図", url: "https://www.city.konan.lg.jp/kurashi/suido/1003555/1003588/1003611.html" },
      ],
      note: "台帳平面図は参考図で証明にはならない。供用区域図とマンホールポンプ排水区域図もPDFで公開。",
    },
    gas: { ...TOHO_GAS, note: `東邦ガスの供給区域は約款に書かれた町だけ（古知野町・赤童子町の一部など）。それ以外は託送受付センター 052-872-9598 で確認。${TOHO_GAS.note}` },
    planMap: { label: "マップあいち（都市計画総括図）", url: "https://maps.pref.aichi.jp/" },
  },
  {
    city: "一宮市",
    tokutei: "一宮市（特定行政庁）建築部 建築指導課 建築審査グループ（本庁舎7階・0586-28-8645）",
    road: {
      office: "一宮市 建築部 建築指導課 建築審査グループ（本庁舎7階）",
      phone: "0586-28-8645",
      online: false,
      links: [
        { label: "道路種別の照会（Webフォーム・回答1週間目安）", url: "https://logoform.jp/form/Z3LR/385640" },
        { label: "道路種別の照会の案内", url: "https://www.city.ichinomiya.aichi.jp/kenchiku/kenchikushidou/1044393/1044394/1019137/1057833.html" },
      ],
      note: "指定道路図の地図公開は見当たらない。道路種別はWebフォームで照会。照会の前に道水路管理課で市道認定の有無と幅員を確かめておくよう求められている。",
    },
    ledger: {
      office: "一宮市 建設部 道水路管理課 管理グループ（本庁舎8階）",
      phone: "0586-28-8637",
      online: true,
      links: [
        { label: "市道認定路線網図（138マップ）の案内", url: "https://www.city.ichinomiya.aichi.jp/kensetsu/dousuirokanri/1044414/1044415/1044416/1032215.html" },
        { label: "幅員の照会（Webフォーム）", url: "https://logoform.jp/form/Z3LR/434209" },
      ],
      note: "路線名は138マップで公開。幅員の公開は一部のみで、ほかはWebフォームか窓口で照会（電話不可）。",
    },
    water: {
      office: "一宮市 水道お客さまセンター 給排水担当（本庁舎10階）",
      phone: "0586-85-7692",
      online: true,
      links: [{ label: "水道台帳図（138マップ）の案内", url: "https://www.city.ichinomiya.aichi.jp/faq/1005662/1006016/1050118.html" }],
      note: "本管（口径・材質）は138マップで公開。引込管など本管以外の不動産照会は本庁舎10階の窓口に来庁が必要。",
    },
    sewer: {
      office: "一宮市 上下水道部 管路保全課 情報管理グループ",
      phone: "0586-73-8165",
      online: true,
      links: [
        { label: "下水道台帳図（138マップ・2026年9月〜全域）", url: "https://www.city.ichinomiya.aichi.jp/jougesuidou/kanrohozen/1044061/1076038/index.html" },
        { label: "供用開始区域図", url: "https://www.city.ichinomiya.aichi.jp/jougesuidou/eigyou/1044047/1000188/1002085.html" },
      ],
      note: "138マップで本管の口径・材質・供用区域・排除方式を無料閲覧。取付管の確認は窓口へ。建築確認申請の前には給排水担当（0586-85-7692）での区域確認が必須。",
    },
    gas: TOHO_GAS,
    planMap: { label: "138マップ（都市計画情報）", url: "https://www.sonicweb-asp.jp/ichinomiya/" },
  },
  {
    city: "名古屋市",
    tokutei: "名古屋市（特定行政庁）住宅都市局 建築指導部 建築審査課（052-972-2929）",
    road: {
      office: "名古屋市 住宅都市局 建築指導課 道路審査担当（西庁舎2階）",
      phone: "052-972-2928",
      online: true,
      links: [
        { label: "名古屋市 指定道路図（Web）", url: "https://www.shiteidourozu.city.nagoya.jp/nagoya/" },
        { label: "指定道路図の調べ方（PDF）", url: "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/018/478/shirabekata-8.pdf" },
      ],
      note: "42条1項1・2・3・5号と2項道路の種別、位置指定道路の指定日・幅員・延長が見られる。種別が出ない・迷うときは道路審査担当に相談。",
    },
    ledger: {
      office: "名古屋市 緑政土木局 道路利活用課 道路財産担当",
      phone: "052-972-2843",
      online: true,
      links: [
        { label: "名古屋市道路認定情報サービス", url: "https://www.sonicweb-asp.jp/nagoya/index" },
        { label: "道路の認定情報の案内", url: "https://www.city.nagoya.jp/jigyou/douro/1026326/index.html" },
      ],
      note: "2026年1月に停止、2月6日に再開し、4月から「道路認定情報サービス」に移行。路線名・幅員・道路番号、台帳幅員が見られる。台帳平面図は道路利活用課（西庁舎6階）か道路台帳サービスセンター（052-265-1167）。境界は測量調査課の方面分室に申請。",
    },
    water: {
      office: "名古屋市 上下水道局 給排水設備課（西庁舎7階）／各営業センター",
      phone: "052-972-3738",
      online: true,
      links: [
        { label: "埋管図の電子提供（試行・申込でPDFをメール）", url: "https://www.water.city.nagoya.jp/category/20000jigyousyano/163314.html" },
        { label: "なごや上下水道埋管まっぷ（建築士事務所等の登録制）", url: "https://www.water.city.nagoya.jp/category/notice_j/143876.html" },
      ],
      note: "道路内の配水管は埋管まっぷ（登録制）・電子提供・窓口で入手。宅内の引込管の図面は窓口で確認。",
    },
    sewer: {
      office: "名古屋市 上下水道局 給排水設備課",
      phone: "052-972-3737",
      online: true,
      links: [
        { label: "埋管図の電子提供（上水・下水）", url: "https://www.water.city.nagoya.jp/category/20000jigyousyano/163314.html" },
        { label: "排除方式（合流・分流）の区分図", url: "https://www.water.city.nagoya.jp/category/11002haisuisetsubi/12220.html" },
      ],
      note: "区域内でも下水道が布設されていない路線がある。境界付近は給排水設備課か営業センターに確認。",
    },
    gas: TOHO_GAS,
    planMap: { label: "名古屋市都市計画情報提供サービス", url: "https://www2.wagmap.jp/nagoya-tokei/Portal" },
  },
];

/** 住所（または「〇〇市」）から登録済みの市を探す。 */
export function municipalityOf(text: string): Municipality | null {
  const t = text.replace(/\s/g, "");
  return MUNICIPALITIES.find((m) => t.includes(m.city) && !t.includes(`北${m.city}`)) ?? null;
}
