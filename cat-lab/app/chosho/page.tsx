import type { Metadata } from "next";
import Link from "next/link";
import { AxisBars } from "@/components/AxisBars";
import { CatArt } from "@/components/CatArt";
import { SceneArt } from "@/components/SceneArt";
import { ChoshoShare, RelationShare, type ShareData } from "@/components/ShareActions";
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
    description: `${cat}＝${r.relation.catRole}、わたし＝${r.relation.humanRole}。あなたと猫様の関係も、診断してみませんか？`,
    robots: { index: false },
  };
}

function today(): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date());
}

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const a = first(sp.a);

  if (!isValidAnswers(a)) {
    return (
      <div className="panel busy">
        <CatArt breed="kijitora" uid="nf" traits={{ open: true }} />
        <h1 style={{ marginTop: 12 }}>結果が見つかりません</h1>
        <p style={{ margin: "12px 0 22px", color: "var(--muted)", fontWeight: 700 }}>リンクが途中で切れているか、古いバージョンの結果のようです。もう一度鑑定してみてください。</p>
        <Link href="/chosa" className="btn">鑑定してみる 🐾</Link>
      </div>
    );
  }

  const rawB = first(sp.b);
  const breedId = isBreedId(rawB) ? rawB : "kijitora";
  const cat = cleanName(first(sp.n), 12, "うちの子");
  const owner = cleanName(first(sp.o), 10, "名もなき下僕");
  const r = buildReport(a, breedId, cat);
  const rel = r.relation;
  const traits = traitsFromAxes(r.axes);
  const docNo = documentNumber(a, breedId, cat);

  const vsAnswers = first(sp.vs);
  const vsCat = cleanName(first(sp.vsn), 12, "友達の猫");
  const rawVb = first(sp.vsb);
  const vsBreed = isBreedId(rawVb) ? rawVb : "chatora";
  const other = isValidAnswers(vsAnswers) ? buildReport(vsAnswers, vsBreed, vsCat) : null;
  const cmp = other ? compare(r, other) : null;

  const q = new URLSearchParams({ a, b: breedId, n: cat });
  if (first(sp.o)) q.set("o", owner);
  const ch = new URLSearchParams({ vs: a, vsb: breedId, vsn: cat });

  const share: ShareData = {
    breed: breedId,
    traits,
    rel: rel.id,
    variant: r.variant,
    human: r.human,
    catLine: r.catLine,
    humanLine: r.humanLine,
    relName: rel.name,
    catRole: rel.catRole,
    humanRole: rel.humanRole,
    catchCopy: rel.catch,
    cat,
    owner,
    gradeName: r.grade.name,
    sovereignty: r.sovereignty,
    axes: r.axes,
    evidence: r.evidence.text,
    docNo,
    date: today(),
    query: `?${q.toString()}`,
    challengeQuery: `?${ch.toString()}`,
  };

  return (
    <>
      <section className="rel-hero" style={{ ["--rel" as string]: rel.color }}>
        <p className="rel-kicker">関係性鑑定の結果</p>
        <h1 className="rel-q">あなたと<b>{cat}</b>の関係は…</h1>
        <SceneArt rel={rel.id} variant={r.variant} breed={breedId} traits={traits} human={r.human} uid="main" catLine={r.catLine} humanLine={r.humanLine} />
        <h2 className="rel-name"><span>{rel.name}</span></h2>
        <div className="roles">
          {rel.catRole === rel.humanRole ? (
            <span><small>{cat}とあなたは</small>ふたりとも{rel.catRole}</span>
          ) : (
            <>
              <span><small>{cat}は</small>{rel.catRole}</span>
              <span><small>あなたは</small>{rel.humanRole}</span>
            </>
          )}
        </div>
        <p className="rel-catch">「{rel.catch}」</p>
      </section>

      <RelationShare {...share} />

      <section className="info-card">
        <h3><span className="em" aria-hidden="true">🐾</span>ふたりはこんな関係</h3>
        <p>{rel.desc.replaceAll("{cat}", cat)}</p>
        <div className="breed-note">
          <CatArt breed={breedId} uid="note" />
          <p><b>{r.breed.label}ポイント</b>{r.breed.note.replaceAll("{cat}", cat)}</p>
        </div>
        <p className="second">ちなみに「<b>{r.second.name}</b>」の素質もあり。</p>
      </section>

      <article className="result" style={{ ["--tint" as string]: "var(--bg2)" }}>
        <header className="r-top small">
          <p className="org">主従研究所　関係性鑑定課</p>
          <h2>主従関係　鑑定調書</h2>
        </header>
        <div className="r-body">
          <p className="r-names">
            <span>対象猫：<b>{cat}</b>（{r.breed.label}）</span>
            <span>下僕：<b>{owner}</b></span>
          </p>
          <div className="grade-row">
            <div className="gbox a">
              <p className="gl">あなたの下僕等級</p>
              <p className="gn">{r.grade.name}</p>
            </div>
            <div className="gbox b">
              <p className="gl">猫様の支配率</p>
              <p className="gp">{r.sovereignty}<small>%</small></p>
            </div>
          </div>
          <p className="grade-comment">{r.grade.comment}</p>

          <h3><span className="em" aria-hidden="true">🔍</span>決定的証拠</h3>
          <p className="evidence">{r.evidence.text}</p>

          <h3><span className="em" aria-hidden="true">📝</span>回答から見えたこと</h3>
          <ul className="obs">
            {r.observations.map((o) => (
              <li key={o.text}>{o.text}</li>
            ))}
          </ul>

          <h3><span className="em" aria-hidden="true">📊</span>4つの指標</h3>
          <AxisBars axes={r.axes} />

          <h3><span className="em" aria-hidden="true">💡</span>研究員からの助言</h3>
          <p className="quote">{rel.advice}</p>

          <footer className="r-foot">
            <span>調書番号 {docNo}　{share.date}</span>
            <span>※本調書に法的効力はありません</span>
          </footer>
        </div>
      </article>

      <ChoshoShare {...share} />

      {other && cmp && (
        <section className="section" aria-labelledby="cmp">
          <h2 id="cmp"><small>VERSUS</small>二匹を比べてみた</h2>
          <div className="panel" style={{ marginTop: 0 }}>
            <div className="vs">
              <div className="who"><CatArt breed={breedId} uid="v1" traits={traits} />{cat}<small>{rel.name}</small></div>
              <div className="x">VS</div>
              <div className="who"><CatArt breed={vsBreed} uid="v2" traits={traitsFromAxes(other.axes)} flip />{vsCat}<small>{other.relation.name}</small></div>
            </div>
            {AXIS_ORDER.map((ax) => (
              <div className="cmp-axis" key={ax}>
                <div className="t"><span>{AXES[ax].icon} {AXES[ax].name}</span><em>{r.axes[ax]}% / {other.axes[ax]}%</em></div>
                <div className="bar"><i className={`k-${ax}`} style={{ ["--w" as string]: `${r.axes[ax]}%` }} /></div>
                <div className="bar"><i className="b" style={{ ["--w" as string]: `${other.axes[ax]}%` }} /></div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>上：{cat}　下：{vsCat}</p>
            <p className="cmp-title">{cmp.title}<small>{cmp.matched}/4 一致</small></p>
            <p className="body" style={{ marginTop: 6, textAlign: "center" }}>{cmp.comment}</p>
            <p className="quote" style={{ marginTop: 14 }}>
              {cmp.leader === "even"
                ? `支配率は${r.sovereignty}%と${other.sovereignty}%。ほぼ互角の主従関係です。`
                : `支配率は${cat}が${r.sovereignty}%、${vsCat}が${other.sovereignty}%。${cmp.leader === "a" ? cat : vsCat}の家のほうが、下僕の労働量が${cmp.gap}ポイント多いようです。`}
            </p>
          </div>
        </section>
      )}

      <div className="end-links">
        <Link href="/chosa" className="btn ghost small">別の猫様でも鑑定する</Link>
        <Link href="/types" className="btn ghost small">12の関係をぜんぶ見る</Link>
      </div>
      <p className="disclaimer">この診断は娯楽です。結果はURLに含まれており、サーバーには保存されません。</p>
    </>
  );
}
