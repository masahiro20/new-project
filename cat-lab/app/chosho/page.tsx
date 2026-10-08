import type { Metadata } from "next";
import Link from "next/link";
import { AxisBars } from "@/components/AxisBars";
import { CatArt } from "@/components/CatArt";
import { ResultCard } from "@/components/ResultCard";
import { ChallengeButton } from "@/components/ShareActions";
import type { CardData } from "@/lib/card";
import { isBreedId, traitsFromAxes } from "@/lib/cat";
import { AXES, AXIS_ORDER } from "@/lib/questions";
import { buildReport, cleanName, compare, documentNumber, isValidAnswers } from "@/lib/scoring";

type SP = { [key: string]: string | string[] | undefined };
type Props = { searchParams: Promise<SP> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const a = first(sp.a);
  if (!isValidAnswers(a)) return { title: "結果が見つかりません", robots: { index: false } };
  const cat = cleanName(first(sp.n), 12, "うちの子");
  const r = buildReport(a, first(sp.b), cat);
  return {
    title: `${cat}とわたしは「${r.relation.name}」`,
    description: `${cat}＝${r.relation.catRole}、わたし＝${r.relation.humanRole}。あなたと猫様の関係も、カードにしてみませんか？`,
    robots: { index: false },
  };
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const a = first(sp.a);

  if (!isValidAnswers(a)) {
    return (
      <div className="panel busy">
        <CatArt breed="kijitora" uid="nf" face="pout" />
        <h1 style={{ marginTop: 12 }}>結果が見つかりません</h1>
        <p className="muted" style={{ margin: "12px 0 22px" }}>リンクが途中で切れているか、古いバージョンの結果のようです。もう一度鑑定してみてください。</p>
        <Link href="/chosa" className="btn primary">鑑定してみる</Link>
      </div>
    );
  }

  const rawB = first(sp.b);
  const breedId = isBreedId(rawB) ? rawB : "kijitora";
  const cat = cleanName(first(sp.n), 12, "うちの子");
  const r = buildReport(a, breedId, cat);
  const rel = r.relation;
  const docNo = documentNumber(a, breedId, cat);

  const vsAnswers = first(sp.vs);
  const vsCat = cleanName(first(sp.vsn), 12, "友達の猫");
  const rawVb = first(sp.vsb);
  const vsBreed = isBreedId(rawVb) ? rawVb : "chatora";
  const other = isValidAnswers(vsAnswers) ? buildReport(vsAnswers, vsBreed, vsCat) : null;
  const cmp = other ? compare(r, other) : null;

  const q = new URLSearchParams({ a, b: breedId, n: cat });
  const ch = new URLSearchParams({ vs: a, vsb: breedId, vsn: cat });

  const card: CardData = {
    name: cat,
    breedId,
    breedLabel: r.breed.label,
    rel: { id: rel.id, name: rel.name, catRole: rel.catRole, humanRole: rel.humanRole, catIcon: rel.catIcon, humanIcon: rel.humanIcon, theme: rel.theme, stickers: rel.stickers, face: rel.face, acc: rel.acc },
    catLine: r.catLine,
    aruaru: r.aruaru,
    rarity: { rank: r.rarity.rank, label: r.rarity.label },
    axes: r.axes,
  };

  return (
    <div style={{ ["--accent" as string]: rel.theme[2], ["--c1" as string]: rel.theme[0], ["--c2" as string]: rel.theme[1] }}>
      <header className="res-head">
        <p className="kicker">鑑定結果</p>
        <h1>あなたと<b>{cat}</b>の関係は…</h1>
      </header>

      <ResultCard data={card} docNo={docNo} query={`?${q.toString()}`} />

      <section className="sheet">
        <h2 className="sheet-title"><span className="ico" aria-hidden="true">{rel.catIcon}</span>{rel.name}</h2>
        <p className="sheet-catch">「{rel.catch}」</p>
        <p>{rel.desc.replaceAll("{cat}", cat)}</p>
        <div className="breed-note">
          <CatArt breed={breedId} uid="note" face={rel.face} acc={rel.acc} />
          <p><b>{r.breed.label}らしさ</b>{r.breed.note.replaceAll("{cat}", cat)}</p>
        </div>
        <p className="second">ちなみに「<b>{r.second.name}</b>」の素質もあり。</p>
      </section>

      <section className="sheet">
        <h2 className="sheet-h">この関係のあるある</h2>
        <ul className="aru">
          {rel.aruaru.map((x) => (
            <li key={x.label}><span>{x.label}</span>{x.text}</li>
          ))}
        </ul>
      </section>

      <section className="sheet">
        <h2 className="sheet-h">鑑定の決め手</h2>
        <p className="evidence">{r.evidence.text}</p>
        <ul className="obs">
          {r.observations.map((o) => (
            <li key={o.text}>{o.text}</li>
          ))}
        </ul>
      </section>

      <section className="sheet">
        <h2 className="sheet-h">ふたりのバランス</h2>
        <div className="grade-row">
          <div className="gbox">
            <p className="gl">あなたの下僕等級</p>
            <p className="gn">{r.grade.name}</p>
          </div>
          <div className="gbox">
            <p className="gl">猫様の支配率</p>
            <p className="gp">{r.sovereignty}<small>%</small></p>
          </div>
        </div>
        <p className="grade-comment">{r.grade.comment}</p>
        <AxisBars axes={r.axes} />
        <p className="advice"><b>研究員からひとこと</b>{rel.advice}</p>
      </section>

      <ChallengeButton name={cat} relName={rel.name} query={`?${ch.toString()}`} />

      {other && cmp && (
        <section className="sheet" aria-labelledby="cmp">
          <h2 id="cmp" className="sheet-h">二匹を比べてみた</h2>
          <div className="vs">
            <div className="who"><CatArt breed={breedId} uid="v1" face={rel.face} acc={rel.acc} />{cat}<small>{rel.name}</small></div>
            <div className="x">VS</div>
            <div className="who"><CatArt breed={vsBreed} uid="v2" face={other.relation.face} acc={other.relation.acc} flip />{vsCat}<small>{other.relation.name}</small></div>
          </div>
          {AXIS_ORDER.map((ax) => (
            <div className="cmp-axis" key={ax}>
              <div className="t"><span>{AXES[ax].icon} {AXES[ax].name}</span><em>{r.axes[ax]}% / {other.axes[ax]}%</em></div>
              <div className="bar"><i className={`k-${ax}`} style={{ ["--w" as string]: `${r.axes[ax]}%` }} /></div>
              <div className="bar"><i className="b" style={{ ["--w" as string]: `${other.axes[ax]}%` }} /></div>
            </div>
          ))}
          <p className="muted small">上：{cat}　下：{vsCat}</p>
          <p className="cmp-title">{cmp.title}<small>{cmp.matched}/4 一致</small></p>
          <p className="center">{cmp.comment}</p>
        </section>
      )}

      <div className="end-links">
        <Link href="/chosa" className="btn soft small">別の猫様でもカードをつくる</Link>
        <Link href="/types" className="btn soft small">12の関係をぜんぶ見る</Link>
      </div>
      <p className="disclaimer">この診断は娯楽です。結果はURLに含まれており、サーバーには保存されません。</p>
    </div>
  );
}
