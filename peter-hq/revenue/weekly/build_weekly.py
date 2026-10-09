"""毎週月曜の収益週報を作る。

使い方:
  1. metrics.csv に、その週の数字を1行ずつ足す（week_ending は週の最終日＝日曜、YYYY-MM-DD）。
     例: 2026-10-18,P0,サイト訪問,180,Cloudflare Web Analytics,
  2. python3 build_weekly.py 2026-10-18
     → reports/2026-10-19.md（月曜の日付）ができる。下半分（打ち手・判断・お願い）は手で書く。

数字は metrics.csv にあるものだけを使う。ない数字は「未計測」と出し、推測で埋めない。
"""
import csv
import datetime as dt
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent


def load(name):
    with open(HERE / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fmt(v):
    if v is None:
        return "未計測"
    return f"{int(v):,}" if float(v).is_integer() else f"{v:,.1f}"


def main(week_ending: str) -> Path:
    we = dt.date.fromisoformat(week_ending)
    prev = (we - dt.timedelta(days=7)).isoformat()
    monday = we + dt.timedelta(days=1)
    metrics = load("metrics.csv")
    targets = load("targets.csv")

    cur, last, src = {}, {}, defaultdict(str)
    for m in metrics:
        key = (m["project"], m["metric"])
        if m["week_ending"] == week_ending:
            cur[key] = num(m["value"])
            src[key] = m["source"]
        elif m["week_ending"] == prev:
            last[key] = num(m["value"])

    rows = []
    seen = set()
    for t in targets:
        key = (t["project"], t["metric"])
        seen.add(key)
        c, l, tg = cur.get(key), last.get(key), num(t["target"])
        diff = "—" if c is None or l is None else f"{c - l:+,.0f}"
        pct = "—" if c is None or not tg else f"{c / tg:.0%}"
        rows.append(f"| {t['project']} | {t['metric']} | {t['unit']} | {fmt(c)} | {diff} | {fmt(tg)}（{t['week_ending']}まで） | {pct} | {src[key] or '—'} |")
    for key, c in cur.items():
        if key not in seen:
            l = last.get(key)
            diff = "—" if l is None else f"{c - l:+,.0f}"
            rows.append(f"| {key[0]} | {key[1]} | — | {fmt(c)} | {diff} | — | — | {src[key] or '—'} |")

    missing = [f"{t['project']} {t['metric']}" for t in targets if (t["project"], t["metric"]) not in cur]
    sales_now = cur.get(("全体", "売上合計"))
    body = f"""# 収益週報 {monday.isoformat()}（月）

対象週：{(we - dt.timedelta(days=6)).isoformat()}〜{week_ending}　作成：Midas
数字は `metrics.csv` にあるものだけ。推測で埋めていない。

## 1. 今週の要点（3行）
- 売上合計（累計）：**{fmt(sales_now) + ("円" if sales_now is not None else "")}**
- （手で書く：いちばん良かった数字）
- （手で書く：いちばん悪かった数字と、その理由の見立て）

## 2. 数字
| PJ | 指標 | 単位 | 今週 | 先週比 | 目標 | 達成率 | 出典 |
|---|---|---|---:|---:|---:|---:|---|
{chr(10).join(rows)}

**未計測**：{('、'.join(missing)) if missing else 'なし'}

## 3. ゲートの判定
| PJ | ゲート | 状態 |
|---|---|---|
| P0 | 有料版を出す：品質確認済み かつ（診断30件 または 公開14日） | （手で書く） |
| P0 | 診断100件で購入0件なら、導線を直す | （手で書く） |
| P8 | CrazyGames 提出：初回の出撃スキップ・再出撃・日替わり目標が入った | （手で書く） |
| P7 | G1：30日で1件以上 | （手で書く） |

## 4. 来週の打ち手トップ3
1. （手で書く：何を出し、何の数字をいくつ動かすか）
2.
3.

## 5. オーナーにお願いすること（お金・アカウント・公開・法務だけ）
| # | 内容 | 時間 | 期限 |
|---|---|---|---|
| 1 | | | |

## 6. ダッシュボードの更新
- [ ] 30日の目標と実績の差を、収益ダッシュボード（https://claude.ai/artifact/WmKDLCGPkNdz1pqSNHxRcA）に反映した
"""
    out = HERE / "reports" / f"{monday.isoformat()}.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text(body, encoding="utf-8")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 build_weekly.py YYYY-MM-DD（週の最終日＝日曜）")
    print(main(sys.argv[1]))
