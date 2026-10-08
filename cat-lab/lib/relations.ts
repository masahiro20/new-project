import type { Accessory, Face } from "./cat.ts";

export type RelationId =
  | "king" | "ojou" | "oshi" | "lovers" | "buddy" | "baby"
  | "tsundere" | "boss" | "roommate" | "master" | "artist" | "partner";

export type Aruaru = { label: string; text: string };

export type Relation = {
  id: RelationId;
  name: string;
  catRole: string;
  humanRole: string;
  /** カードに添える役割の絵文字 */
  catIcon: string;
  humanIcon: string;
  catch: string;
  /** {cat} は猫の名前に置き換わる */
  desc: string;
  advice: string;
  /** 4指標（君臨・甘え・気まぐれ・要求）の典型値 */
  center: [number, number, number, number];
  /** どの関係もほぼ同じ割合で出るよう、シミュレーションで決めた距離の補正 */
  offset: number;
  /** 猫様の口ぐせ（カードに大きく載る） */
  catLines: string[];
  /** あるある。カードに2つ載る */
  aruaru: Aruaru[];
  face: Face;
  acc: Accessory;
  /** カードのテーマ色（グラデーション上・下、文字の差し色） */
  theme: [string, string, string];
  /** カードの背景に散らすステッカー */
  stickers: string[];
};

export const RELATIONS: Relation[] = [
  {
    id: "king", name: "王様と家来", catRole: "王様", humanRole: "家来", catIcon: "👑", humanIcon: "🙇",
    catch: "くるしゅうない。ちこう寄れ",
    desc: "この家の玉座は、{cat}のもの。あなたは忠実な家来として、毎日せっせと献上品を運んでいます。でも実は、家来がいないと王様はちょっと困ってしまうのです。",
    advice: "献上品のグレードは、たまに上げましょう。王様は記念日に弱いです。",
    center: [82, 46, 46, 78], offset: -323,
    catLines: ["くるしゅうない", "献上品はまだか", "よきにはからえ", "ちこう寄れ", "本日もご苦労"],
    aruaru: [
      { label: "特技", text: "目線だけで家来を動かす" },
      { label: "弱点", text: "献上品のグレードダウン" },
      { label: "日課", text: "玉座（あなたの席）の巡回" },
      { label: "好きな言葉", text: "「いますぐ」" },
      { label: "最近の悩み", text: "家来の帰りが遅い" },
      { label: "ひみつ", text: "家来がいないと、ちょっと不安" },
    ],
    face: "smug", acc: "crown", theme: ["#ffe7a3", "#ffc9d2", "#e0a21b"], stickers: ["👑", "✨", "💎"],
  },
  {
    id: "ojou", name: "お嬢様と執事", catRole: "お嬢様", humanRole: "執事", catIcon: "🎀", humanIcon: "🤵",
    catch: "ねえ、紅茶はまだかしら",
    desc: "気品あふれる{cat}と、完璧なおもてなしを心がけるあなた。お嬢様のわがままを先回りして叶えるのが、執事の誇りです。",
    advice: "執事にも休日を。お嬢様は、執事が隣でうたた寝しているのも好きなのです。",
    center: [70, 68, 50, 70], offset: -83,
    catLines: ["紅茶はまだ？", "今日はこれじゃない気分", "褒めてつかわすわ", "ちょっと、執事", "わたくし、疲れましたの"],
    aruaru: [
      { label: "特技", text: "高級フードを一口で見抜く" },
      { label: "弱点", text: "安いおやつへの露骨な態度" },
      { label: "日課", text: "執事のおもてなし採点" },
      { label: "好きな言葉", text: "「お嬢様」" },
      { label: "最近の悩み", text: "クッションのふかふか度" },
      { label: "ひみつ", text: "執事の膝がいちばん好き" },
    ],
    face: "happy", acc: "bow", theme: ["#ffe1ec", "#e8dcff", "#e2558a"], stickers: ["🎀", "🫖", "🌷"],
  },
  {
    id: "oshi", name: "推しとオタク", catRole: "推し", humanRole: "オタク", catIcon: "🌟", humanIcon: "📸",
    catch: "今日も推しが尊い",
    desc: "{cat}の一挙一動が、あなたにとってのファンサービス。写真フォルダは推しで埋まり、目が合うたびに心拍数が上がります。推しは今日も、気まぐれに微笑んでくれます。",
    advice: "カメラロールの整理を。推しの写真はアルバムにすると、一生の宝物になります。",
    center: [62, 30, 66, 36], offset: 585,
    catLines: ["ファンサしてあげる", "撮影は1枚までね", "今日はオフです", "…見すぎ", "応援ありがと"],
    aruaru: [
      { label: "特技", text: "カメラを向けると目をそらす" },
      { label: "弱点", text: "連写の音" },
      { label: "日課", text: "気まぐれなファンサ" },
      { label: "オタクの日課", text: "カメラロールが推しで埋まる" },
      { label: "最近の悩み", text: "オタクの愛が重い" },
      { label: "ひみつ", text: "撮られるの、実は好き" },
    ],
    face: "sparkle", acc: "starclip", theme: ["#dcd4ff", "#ffd6ea", "#7a5ce0"], stickers: ["🌟", "💜", "📸"],
  },
  {
    id: "lovers", name: "恋人同士", catRole: "恋人", humanRole: "恋人", catIcon: "💗", humanIcon: "💗",
    catch: "ずっと一緒にいようね",
    desc: "目が合えば、しっぽでお返事。{cat}とあなたは、言葉がなくても通じ合う相思相愛のふたりです。周りが見たら、ちょっと照れるくらいの甘さです。",
    advice: "毎日の「おかえり」の儀式を大切に。それが、ふたりの愛の言葉です。",
    center: [38, 82, 40, 52], offset: 453,
    catLines: ["ずっと一緒ね", "もっと撫でて", "今日も好き", "帰り、遅かったね", "となり、空いてる？"],
    aruaru: [
      { label: "特技", text: "目が合うとゆっくりまばたき" },
      { label: "弱点", text: "あなたの「いってきます」" },
      { label: "日課", text: "玄関でのお出迎え" },
      { label: "好きな場所", text: "あなたの腕まくら" },
      { label: "最近の悩み", text: "あなたのスマホにやきもち" },
      { label: "ひみつ", text: "あなたの匂いで安心する" },
    ],
    face: "heart", acc: "flowers", theme: ["#ffd6e0", "#ffe9d6", "#e8506e"], stickers: ["💗", "🌸", "💌"],
  },
  {
    id: "buddy", name: "最高の相棒", catRole: "相棒", humanRole: "相棒", catIcon: "🤝", humanIcon: "🤝",
    catch: "おまえとなら、どこへでも",
    desc: "ベタベタしすぎず、離れすぎない。{cat}とあなたは、同じ目線で毎日を楽しむ最高のコンビです。ハイタッチひとつで、気持ちが通じ合います。",
    advice: "新しい遊びを一緒に探しましょう。相棒は、ちいさな冒険が大好きです。",
    center: [34, 60, 34, 36], offset: 149,
    catLines: ["今日なにする？", "いいじゃん", "ナイス、相棒", "まかせて", "おやつ、半分こね"],
    aruaru: [
      { label: "特技", text: "あなたの気分を3秒で察する" },
      { label: "弱点", text: "あなたの留守番中" },
      { label: "日課", text: "あなたの後ろをついて歩く" },
      { label: "好きな遊び", text: "あなたと一緒ならなんでも" },
      { label: "最近の悩み", text: "相棒の運動不足" },
      { label: "ひみつ", text: "いちばんの理解者だと思ってる" },
    ],
    face: "grin", acc: "scarf", theme: ["#ffe0bf", "#d9f2e6", "#e2782a"], stickers: ["🤝", "⭐", "🎒"],
  },
  {
    id: "baby", name: "赤ちゃんとお世話係", catRole: "赤ちゃん", humanRole: "お世話係", catIcon: "🍼", humanIcon: "🧸",
    catch: "だっこ〜！ ごはん〜！",
    desc: "{cat}は、いくつになってもあなたの赤ちゃん。ごはん、なでなで、だっこ。要求はすべて、全力で叶えてしまいます。お世話できる幸せを、あなたは知っています。",
    advice: "甘やかしすぎて、お世話係が倒れないように。あなたの睡眠も大切です。",
    center: [44, 76, 52, 80], offset: 53,
    catLines: ["おなかすいた〜", "だっこ！", "ねむい…", "いっしょにねる", "みてみて〜"],
    aruaru: [
      { label: "特技", text: "鳴き声ひとつで人を動かす" },
      { label: "弱点", text: "ひとりのお留守番" },
      { label: "日課", text: "朝5時のごはん催促" },
      { label: "好きなもの", text: "だっこ（ただし今だけ）" },
      { label: "お世話係の悩み", text: "甘やかしが止まらない" },
      { label: "ひみつ", text: "お世話されるのが生きがい" },
    ],
    face: "sparkle", acc: "bonnet", theme: ["#d6ecff", "#fff1cf", "#3f8fd8"], stickers: ["🍼", "🧸", "☁️"],
  },
  {
    id: "tsundere", name: "ツンデレ幼なじみ", catRole: "ツンデレ", humanRole: "幼なじみ", catIcon: "💢", humanIcon: "😌",
    catch: "べ、別に待ってないし",
    desc: "素っ気ないふりをして、実はずっとあなたを見ている{cat}。近づけば離れ、離れれば寄ってくる。その距離感こそが、ふたりの長年の絆です。",
    advice: "追いかけすぎないのがコツ。向こうから来たときに、たっぷり甘やかしましょう。",
    center: [48, 54, 76, 40], offset: 629,
    catLines: ["べ、別に…", "ふん", "勘違いしないでよね", "…遅かったじゃん", "たまたま来ただけ"],
    aruaru: [
      { label: "特技", text: "呼ぶと来ない。呼ばないと来る" },
      { label: "弱点", text: "ふいうちのなでなで" },
      { label: "日課", text: "少し離れた場所からの監視" },
      { label: "口に出さないけど", text: "あなたの帰りを待ってる" },
      { label: "最近の悩み", text: "素直になるタイミング" },
      { label: "ひみつ", text: "寝てるあなたにはべったり" },
    ],
    face: "pout", acc: "none", theme: ["#ffeab3", "#ffd4c4", "#e46a3c"], stickers: ["💢", "💛", "☁️"],
  },
  {
    id: "boss", name: "社長と秘書", catRole: "社長", humanRole: "秘書", catIcon: "💼", humanIcon: "📋",
    catch: "例の件、どうなっている",
    desc: "{cat}は、家庭という会社を率いる敏腕社長。あなたは、スケジュールから食事まで管理する有能な秘書です。今日もアポイントは分刻みです。",
    advice: "秘書の残業はほどほどに。社長は、ごはんの時間厳守で評価します。",
    center: [72, 22, 24, 58], offset: -423,
    catLines: ["例の件は？", "会議は5分で", "ごはんの時間だ", "報告を", "今月の目標は昼寝10時間"],
    aruaru: [
      { label: "特技", text: "ごはんの時間を1分単位で把握" },
      { label: "弱点", text: "予定外の来客" },
      { label: "日課", text: "秘書の業務チェック" },
      { label: "経営方針", text: "昼寝は最優先事項" },
      { label: "最近の悩み", text: "秘書のキーボード業務" },
      { label: "ひみつ", text: "秘書の評価はかなり高い" },
    ],
    face: "smug", acc: "tie", theme: ["#dbe7ff", "#e6eef7", "#3c6fc8"], stickers: ["💼", "📈", "☕"],
  },
  {
    id: "roommate", name: "気ままなルームメイト", catRole: "ルームメイト", humanRole: "ルームメイト", catIcon: "🛋️", humanIcon: "🛋️",
    catch: "お互い、好きにやろう",
    desc: "干渉しすぎず、同じ空間で自分らしく過ごす。{cat}とあなたは、気を使わない最高のルームメイトです。ふと目が合ったときの安心感が、何よりの絆です。",
    advice: "たまには同じ部屋でのんびりを。それだけで、関係はもっと深まります。",
    center: [28, 30, 34, 28], offset: -1111,
    catLines: ["おかまいなく", "すや…", "そっちはそっちで", "この部屋、いいね", "…（あくび）"],
    aruaru: [
      { label: "特技", text: "どこでも即寝" },
      { label: "弱点", text: "掃除機" },
      { label: "日課", text: "同じ部屋で別々にくつろぐ" },
      { label: "ふたりのルール", text: "お互いの昼寝は邪魔しない" },
      { label: "最近の悩み", text: "とくになし（平和）" },
      { label: "ひみつ", text: "同じ部屋にいないと落ち着かない" },
    ],
    face: "sleepy", acc: "nightcap", theme: ["#d9f2e6", "#e3ecff", "#3c9c78"], stickers: ["🛋️", "🌙", "💤"],
  },
  {
    id: "master", name: "師匠と弟子", catRole: "師匠", humanRole: "弟子", catIcon: "🍵", humanIcon: "📝",
    catch: "焦るな。まずは寝よ",
    desc: "悠然と構える{cat}は、生き方の師匠。あなたは師匠の背中から、ゆるく気持ちよく生きる術を学ぶ弟子です。",
    advice: "師匠の昼寝を見習って、あなたも休む日を。それがいちばんの修行です。",
    center: [66, 40, 24, 28], offset: -327,
    catLines: ["焦るでない", "まずは寝よ", "日向は、待てば来る", "修行が足りぬ", "よき心がけじゃ"],
    aruaru: [
      { label: "特技", text: "日なたの位置を先読みする" },
      { label: "弱点", text: "急な物音" },
      { label: "日課", text: "1日16時間の瞑想（昼寝）" },
      { label: "教え", text: "眠いときは、寝る" },
      { label: "弟子の悩み", text: "師匠の境地にたどり着けない" },
      { label: "ひみつ", text: "弟子の成長を見守っている" },
    ],
    face: "happy", acc: "glasses", theme: ["#eae2cf", "#dcefd8", "#7a8a3c"], stickers: ["🍵", "🎋", "🍃"],
  },
  {
    id: "artist", name: "天才アーティストとマネージャー", catRole: "天才アーティスト", humanRole: "マネージャー", catIcon: "🎨", humanIcon: "📆",
    catch: "凡人には分かるまい",
    desc: "気まぐれで情熱的な、天才肌の{cat}。予測不能な「作品（いたずら）」の数々を、あなたはマネージャーとして片付け、支え、そして誰よりも称えています。",
    advice: "作品は写真に残しておきましょう。いつか個展が開けるかもしれません。",
    center: [52, 34, 78, 70], offset: 37,
    catLines: ["これは芸術", "ひらめいた…！", "凡人には分かるまい", "次回作に期待して", "今日はノらない"],
    aruaru: [
      { label: "代表作", text: "トイレットペーパーの大作" },
      { label: "弱点", text: "インスピレーションの枯渇" },
      { label: "日課", text: "深夜の創作活動（運動会）" },
      { label: "こだわり", text: "爪とぎは高級ソファで" },
      { label: "マネージャーの悩み", text: "作品の後片付け" },
      { label: "ひみつ", text: "褒められると次回作が早い" },
    ],
    face: "wink", acc: "beret", theme: ["#ffd9cf", "#fff0b8", "#e04a4a"], stickers: ["🎨", "🖌️", "💫"],
  },
  {
    id: "partner", name: "いたずらの共犯者", catRole: "共犯者", humanRole: "共犯者", catIcon: "🤫", humanIcon: "🤫",
    catch: "シーッ、ふたりだけの秘密ね",
    desc: "夜中のつまみ食いも、ちょっとしたいたずらも、{cat}とあなたはいつも一緒。叱るより先に笑ってしまう、仲良しの共犯者です。",
    advice: "いたずらは、家族にバレない範囲で。ふたりの秘密は、絆の証です。",
    center: [36, 58, 68, 62], offset: 357,
    catLines: ["シーッ", "やっちゃう？", "バレてないよ", "次はあれね", "ふたりの秘密ね"],
    aruaru: [
      { label: "特技", text: "机の上のものを落とす" },
      { label: "弱点", text: "現行犯の写真" },
      { label: "日課", text: "夜中のキッチン偵察" },
      { label: "得意な顔", text: "「やってません」の顔" },
      { label: "共犯者の悩み", text: "叱るより先に笑ってしまう" },
      { label: "ひみつ", text: "いたずらは、かまってほしいから" },
    ],
    face: "wink", acc: "mask", theme: ["#cfeee6", "#fff2c2", "#2f9a86"], stickers: ["🤫", "🐟", "💥"],
  },
];

export const RELATION_BY_ID = new Map(RELATIONS.map((r) => [r.id, r]));
