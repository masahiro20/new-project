"""Merge the per-range storyboard files into one episode.

Reads seq-s1, s2, t1, s3, t2, s4 (in broadcast order), numbers cuts 1..N,
computes timecodes, and writes:
  data.js        - window.EP01 = {...} for the preview page
  ep01-conte.md  - the cut list as a readable table
Usage: python3 build.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ["s1", "s2", "t1", "s3", "t2", "s4"]
LABELS = {
    "s1": "アバン①　夜市", "s2": "アバン②　追跡〜タイトル", "t1": "Aパート〜Bパート前半",
    "s3": "Bパート　覚醒", "t2": "Bパート後半〜Cパート", "s4": "タグ・次回予告",
}


def tc(sec):
    m, s = divmod(int(round(sec)), 60)
    return f"{m:02d}:{s:02d}"


def main():
    seqs, cuts, t, missing = [], [], 0.0, []
    for key in ORDER:
        path = os.path.join(HERE, f"seq-{key}.json")
        if not os.path.exists(path):
            missing.append(key)
            continue
        with open(path, encoding="utf-8") as f:
            seq = json.load(f)
        start, n0 = t, len(cuts)
        for c in seq["cuts"]:
            frames = [fr for fr in c.get("frames", []) if os.path.exists(os.path.join(HERE, "frames", fr))]
            cuts.append({
                "no": len(cuts) + 1, "seq": key, "local": c.get("cut"),
                "scene": c.get("scene", ""), "start": round(t, 2), "sec": float(c.get("sec", 0)),
                "frames": frames, "camera": c.get("camera", ""), "shot": c.get("shot", ""),
                "picture": c.get("picture", ""), "action": c.get("action", ""),
                "dialogue": c.get("dialogue", ""), "dialogue_en": c.get("dialogue_en", ""),
                "sound": c.get("sound", ""),
            })
            t += float(c.get("sec", 0))
        seqs.append({"key": key, "label": LABELS[key], "range": seq.get("range"), "start": round(start, 2),
                     "end": round(t, 2), "first": n0 + 1, "last": len(cuts), "drawn": key.startswith("s")})

    data = {"title": "RED LEDGER 第1話「払わねえよ。」絵コンテ", "total": round(t, 2), "seqs": seqs, "cuts": cuts}
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.EP01 = " + json.dumps(data, ensure_ascii=False) + ";\n")

    lines = ["# RED LEDGER 第1話「払わねえよ。」絵コンテ（カット表）", "",
             f"総尺 {tc(t)}／{len(cuts)}カット／作画フレーム {sum(len(c['frames']) for c in cuts)}枚", ""]
    for s in seqs:
        lines += [f"## {s['label']}（{tc(s['start'])}–{tc(s['end'])}）", "",
                  "| C | TC | 秒 | サイズ・カメラ | 画面・芝居 | 台詞 | 音 |", "|---|---|---|---|---|---|---|"]
        for c in cuts[s["first"] - 1:s["last"]]:
            cell = lambda x: str(x).replace("|", "／").replace("\n", " ")
            pic = cell(c["picture"]) + ("　" + cell(c["action"]) if c["action"] else "")
            lines.append(f"| {c['no']} | {tc(c['start'])} | {c['sec']:g} | {cell(c['shot'])} {cell(c['camera'])} | {pic} | {cell(c['dialogue'])} | {cell(c['sound'])} |")
        lines.append("")
    with open(os.path.join(HERE, "ep01-conte.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"{len(cuts)} cuts, total {tc(t)} ({t:.1f}s), frames {sum(len(c['frames']) for c in cuts)}",
          f"missing: {missing}" if missing else "")
    for s in seqs:
        print(f"  {s['key']}: {tc(s['start'])}-{tc(s['end'])} cuts {s['first']}-{s['last']}")


if __name__ == "__main__":
    main()
