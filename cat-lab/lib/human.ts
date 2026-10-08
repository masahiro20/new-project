// 「あなた」のちびキャラ。シーンのSVGに埋め込む <g> を返す。幅140×高さ190の座標系。

export type Pose = "stand" | "kneel" | "sit";
export type Arms = "down" | "up" | "offer" | "hug" | "wave" | "cheer" | "clap" | "shh" | "write" | "camera";
export type Face = "smile" | "heart" | "sweat" | "sleepy" | "surprise" | "grin" | "calm" | "cry";
export type Hair = "short" | "bob" | "bun" | "spiky";

export type HumanOpts = {
  pose?: Pose;
  arms?: Arms;
  face?: Face;
  hair?: Hair;
  hairColor?: string;
  shirt?: string;
  pants?: string;
  extra?: "bowtie" | "apron" | "glasses" | "suit" | "none";
  /** 胴体と前側の腕のあいだに差し込むSVG（抱っこしている猫など）。この人物の座標系で書く */
  hold?: string;
};

const OL = "#3b2a24";
const SKIN = "#ffe0c7";

function arm(x1: number, y1: number, x2: number, y2: number, shirt: string): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + 4;
  const d = `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`;
  return `<path d="${d}" fill="none" stroke="${OL}" stroke-width="17" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${shirt}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="${x2}" cy="${y2}" r="8" fill="${SKIN}" stroke="${OL}" stroke-width="4"/>`;
}

function face(f: Face): string {
  const eyeDot = (x: number) => `<circle cx="${x}" cy="54" r="4.2" fill="${OL}"/><circle cx="${x - 1.4}" cy="52.6" r="1.4" fill="#fff"/>`;
  const happy = (x: number) => `<path d="M${x - 6} 56Q${x} 47 ${x + 6} 56" fill="none" stroke="${OL}" stroke-width="3.6" stroke-linecap="round"/>`;
  const heart = (x: number) => `<path d="M${x} 59l-6-6a3.6 3.6 0 0 1 6-4a3.6 3.6 0 0 1 6 4Z" fill="#ff4f7b" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const line = (x: number) => `<path d="M${x - 6} 55h12" stroke="${OL}" stroke-width="3.6" stroke-linecap="round"/>`;
  let s = `<ellipse cx="48" cy="64" rx="7" ry="4.5" fill="#ff8fa3" opacity=".55"/><ellipse cx="92" cy="64" rx="7" ry="4.5" fill="#ff8fa3" opacity=".55"/>`;
  switch (f) {
    case "smile": s += happy(58) + happy(82) + `<path d="M64 66q6 6 12 0" fill="none" stroke="${OL}" stroke-width="3.2" stroke-linecap="round"/>`; break;
    case "grin": s += happy(58) + happy(82) + `<path d="M61 64q9 12 18 0Z" fill="#c2414f" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`; break;
    case "heart": s += heart(58) + heart(82) + `<path d="M61 64q9 12 18 0Z" fill="#c2414f" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`; break;
    case "sweat": s += eyeDot(58) + eyeDot(82) + `<path d="M64 68q6-4 12 0" fill="none" stroke="${OL}" stroke-width="3.2" stroke-linecap="round"/><path d="M104 30q6 10 0 14q-6-4 0-14Z" fill="#7cc8ff" stroke="${OL}" stroke-width="2.4"/>`; break;
    case "sleepy": s += line(58) + line(82) + `<path d="M66 67q4 3 8 0" fill="none" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`; break;
    case "surprise": s += `<circle cx="58" cy="54" r="5" fill="${OL}"/><circle cx="82" cy="54" r="5" fill="${OL}"/><ellipse cx="70" cy="68" rx="4.5" ry="5.5" fill="#c2414f" stroke="${OL}" stroke-width="2.6"/>`; break;
    case "calm": s += eyeDot(58) + eyeDot(82) + `<path d="M65 66q5 4 10 0" fill="none" stroke="${OL}" stroke-width="3.2" stroke-linecap="round"/>`; break;
    case "cry": s += happy(58) + happy(82) + `<path d="M52 58v14M88 58v14" stroke="#7cc8ff" stroke-width="4" stroke-linecap="round"/><path d="M61 66q9 10 18 0Z" fill="#c2414f" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`; break;
  }
  return s;
}

function hair(h: Hair, c: string): string {
  const sw = `stroke="${OL}" stroke-width="5" stroke-linejoin="round"`;
  switch (h) {
    case "bob":
      return `<path d="M36 52Q32 12 70 12Q108 12 104 52L106 80Q94 84 94 66Q92 40 70 36Q48 40 46 66Q46 84 34 80Z" fill="${c}" ${sw}/>`;
    case "bun":
      return `<circle cx="70" cy="10" r="12" fill="${c}" ${sw}/><path d="M38 52Q36 16 70 16Q104 16 102 52Q96 34 82 31Q72 40 52 38Q44 42 38 52Z" fill="${c}" ${sw}/>`;
    case "spiky":
      return `<path d="M38 52Q34 30 42 22L46 8 56 18 64 4 74 16 84 4 90 18 100 12 98 26Q106 36 102 52Q96 36 84 32Q74 42 54 38Q44 42 38 52Z" fill="${c}" ${sw}/>`;
    default:
      return `<path d="M38 52Q36 14 70 14Q104 14 102 52Q96 34 82 30Q72 40 52 38Q44 42 38 52Z" fill="${c}" ${sw}/>`;
  }
}

export function humanG(o: HumanOpts, x: number, y: number, scale = 1, flip = false): string {
  const pose = o.pose ?? "stand";
  const shirt = o.shirt ?? "#7ec8e3";
  const pants = o.pants ?? "#5a6b8c";
  const dy = pose === "kneel" ? 26 : pose === "sit" ? 22 : 0;
  const y0 = 84 + dy; // 肩の高さ
  let s = "";

  // 脚
  if (pose === "stand") {
    s += `<rect x="46" y="126" width="21" height="46" rx="9" fill="${pants}" stroke="${OL}" stroke-width="4.5"/>
      <rect x="73" y="126" width="21" height="46" rx="9" fill="${pants}" stroke="${OL}" stroke-width="4.5"/>
      <ellipse cx="54" cy="174" rx="14" ry="7" fill="#6b4a3a" stroke="${OL}" stroke-width="4"/><ellipse cx="86" cy="174" rx="14" ry="7" fill="#6b4a3a" stroke="${OL}" stroke-width="4"/>`;
  } else if (pose === "kneel") {
    s += `<path d="M30 168Q30 146 70 146Q110 146 110 168Q110 180 70 180Q30 180 30 168Z" fill="${pants}" stroke="${OL}" stroke-width="4.5"/>`;
  } else {
    s += `<ellipse cx="70" cy="170" rx="50" ry="15" fill="${pants}" stroke="${OL}" stroke-width="4.5"/>
      <ellipse cx="36" cy="176" rx="11" ry="7" fill="#6b4a3a" stroke="${OL}" stroke-width="4"/><ellipse cx="104" cy="176" rx="11" ry="7" fill="#6b4a3a" stroke="${OL}" stroke-width="4"/>`;
  }

  // 胴体
  const bodyBottom = pose === "stand" ? 134 : 162;
  s += `<path d="M42 ${y0}Q70 ${y0 - 8} 98 ${y0}L106 ${bodyBottom}Q70 ${bodyBottom + 8} 34 ${bodyBottom}Z" fill="${shirt}" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>`;
  if (o.extra === "apron") s += `<path d="M50 ${y0 + 8}h40l4 ${bodyBottom - y0 - 4}q-24 6-48 0Z" fill="#fff" stroke="${OL}" stroke-width="3.5"/>`;
  if (o.extra === "suit") s += `<path d="M58 ${y0 - 4}l12 26 12-26" fill="#fff" stroke="${OL}" stroke-width="3.5"/><path d="M70 ${y0 + 22}l-5 8 5 22 5-22Z" fill="#e94b5a" stroke="${OL}" stroke-width="2.5"/>`;

  // 腕
  const L = [46, y0 + 8];
  const R = [94, y0 + 8];
  const arms = o.arms ?? "down";
  const A = (to1: number[], to2: number[]) => arm(L[0], L[1], to1[0], to1[1], shirt) + arm(R[0], R[1], to2[0], to2[1], shirt);
  let front = "";
  switch (arms) {
    case "down": s += A([34, y0 + 46], [106, y0 + 46]); break;
    case "up": s += A([26, y0 - 72], [114, y0 - 72]); break;
    case "offer": front += A([56, y0 + 32], [84, y0 + 32]); break;
    case "hug": front += A([90, y0 + 58], [50, y0 + 60]); break;
    case "wave": s += A([34, y0 + 46], [122, y0 - 30]); break;
    case "cheer":
      s += `<rect x="12" y="${y0 - 70}" width="9" height="34" rx="4" fill="#ff7eb6" stroke="${OL}" stroke-width="3" transform="rotate(-18 16 ${y0 - 50})"/>
        <rect x="119" y="${y0 - 70}" width="9" height="34" rx="4" fill="#7ec8e3" stroke="${OL}" stroke-width="3" transform="rotate(18 124 ${y0 - 50})"/>`;
      s += A([24, y0 - 34], [116, y0 - 34]);
      break;
    case "clap": front += A([64, y0 + 18], [76, y0 + 18]); break;
    case "shh": s += arm(L[0], L[1], 34, y0 + 46, shirt); front += arm(R[0], R[1], 78, 70, shirt) + `<path d="M76 72v-12" stroke="${OL}" stroke-width="5" stroke-linecap="round"/>`; break;
    case "write":
      front += `<rect x="38" y="${y0 + 16}" width="34" height="26" rx="3" fill="#fff" stroke="${OL}" stroke-width="3.5" transform="rotate(-8 55 ${y0 + 29})"/>`;
      front += A([48, y0 + 34], [80, y0 + 26]) + `<path d="M80 ${y0 + 26}l10-14" stroke="${OL}" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case "camera":
      front += A([52, y0 - 4], [88, y0 - 4]);
      front += `<rect x="46" y="${y0 - 20}" width="48" height="32" rx="6" fill="#4a4a5a" stroke="${OL}" stroke-width="4"/><circle cx="70" cy="${y0 - 4}" r="10" fill="#9fd8ff" stroke="${OL}" stroke-width="3.5"/><rect x="80" y="${y0 - 26}" width="10" height="7" rx="2" fill="#4a4a5a" stroke="${OL}" stroke-width="3"/>`;
      break;
  }

  // 頭
  const headY = dy;
  let head = `<circle cx="70" cy="50" r="32" fill="${SKIN}" stroke="${OL}" stroke-width="5"/>`;
  head += hair(o.hair ?? "short", o.hairColor ?? "#5a3d2e");
  head += face(o.face ?? "smile");
  if (o.extra === "glasses") head += `<g fill="none" stroke="${OL}" stroke-width="3"><circle cx="58" cy="55" r="9"/><circle cx="82" cy="55" r="9"/><path d="M67 55h6"/></g>`;
  s += `<g transform="translate(0 ${headY})">${head}</g>`;
  if (o.extra === "bowtie") s += `<g transform="translate(70 ${y0 + 2})"><path d="M0 0-13-8-13 8Z" fill="#3b2a24"/><path d="M0 0 13-8 13 8Z" fill="#3b2a24"/><circle r="4" fill="#555"/></g>`;
  if (o.hold) s += o.hold;
  s += front;

  const tf = flip ? `translate(${x + 140 * scale} ${y}) scale(${-scale} ${scale})` : `translate(${x} ${y}) scale(${scale})`;
  return `<g transform="${tf}">${s}</g>`;
}
