import type { Metadata } from "next";
import Link from "next/link";
import { AxisBars } from "@/components/AxisBars";
import { CatArt } from "@/components/CatArt";
import { PawStamp } from "@/components/PawStamp";
import { ShareActions } from "@/components/ShareActions";
import { getCoat, isCoatId, traitsFromAxes } from "@/lib/cat";
import { AXES, AXIS_ORDER } from "@/lib/questions";
import { buildReport, cleanName, compare, documentNumber, isValidAnswers } from "@/lib/scoring";

type SP = { [key: string]: string | string[] | undefined };
type Props = { searchParams: Promise<SP> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const a = first(sp.a);
  if (!isValidAnswers(a)) return { title: "調書が見つかりません", robots: { index: false } };
  const cat = cleanName(first(sp.n), 12, "うちの子");
  const r = buildReport(a, cat);
  return {
    title: `${cat}は「${r.type.name}」`,
    description: `下僕等級は「${r.grade.name}」、猫様の支配率は${r.sovereignty}%。あなたの猫様との主従関係も鑑定してみませんか？`,
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
        <CatArt coat="kijitora" uid="nf" traits={{ open: true }} />
        <h1 style={{ marginTop: 12 }}>調書が見つかりません</h1>
        <p style={{ margin: "12px 0 22px", color: "var(--muted)", fontWeight: 700 }}>リンクが途中で切れているようです。もう一度、事情聴取を受けてみてください。</p>
        <Link href="/chosa" className="btn">事情聴取を受ける 🐾</Link>
      </div>
    );
  }

  const cat = cleanName(first(sp.n), 12, "うちの子");
  const owner = cleanName(first(sp.o), 10, "名もなき下僕");
  const coatRaw = first(sp.c);
  const coatId = isCoatId(coatRaw) ? coatRaw : "kijitora";
  const coat = getCoat(coatId);
  const r = buildReport(a, cat);
  const traits = traitsFromAxes(r.axes);
  const docNo = documentNumber(a, cat);
  const date = today();

  const vsAnswers = first(sp.vs);
  const vsCat = cleanName(first(sp.vsn), 12, "友達の猫");
  const vsCoat = isCoatId(first(sp.vsc)) ? (first(sp.vsc) as string) : "chatora";
  const other = isValidAnswers(vsAnswers) ? buildReport(vsAnswers, vsCat) : null;
  const cmp = other ? compare(r, other) : null;

  const q = new URLSearchParams({ a, n: cat, c: coatId });
  if (first(sp.o)) q.set("o", owner);
  const ch = new URLSearchParams({ vs: a, vsn: cat, vsc: coatId });

  return (
    <>
      <article className="result" style={{ ["--tint" as string]: coat.tint }}>
        <header className="r-top">
          <p className="org">主従研究所　関係性鑑定課</p>
          <h1>主従関係　鑑定調書</h1>
          <PawStamp />
          <CatArt coat={coatId} uid="res" traits={traits} />
        </header>

        <div className="r-body">
          <p className="r-names">
            <span>対象猫：<b>{cat}</b></span>
            <span>下僕：<b>{owner}</b></span>
          </p>

          <section className="r-type" aria-label="判定タイプ">
            <p className="label">判定タイプ</p>
            <h2>{r.type.name}</h2>
            <p className="catch">「{r.type.catch}」</p>
          </section>

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

          <h3><span className="em" aria-hidden="true">🐱</span>タイプ解説</h3>
          <p className="body">{r.type.description}</p>

          <h3><span className="em" aria-hidden="true">🔍</span>決定的証拠</h3>
          <p className="evidence">{r.evidence.text}</p>

          <h3><span className="em" aria-hidden="true">📝</span>観察された事実</h3>
          <ul className="obs">
            {r.observations.slice(1).map((o) => (
              <li key={o.text}>{o.text}</li>
            ))}
          </ul>

          <h3><span className="em" aria-hidden="true">📊</span>4つの指標</h3>
          <AxisBars axes={r.axes} />

          <h3><span className="em" aria-hidden="true">🎓</span>研究員の見解</h3>
          <p className="quote"><small>主従研究所 研究員より</small>{r.type.opinion}</p>
          <h3><span className="em" aria-hidden="true">💡</span>下僕への助言</h3>
          <p className="quote" style={{ background: "var(--pink)" }}>{r.type.advice}</p>

          <footer className="r-foot">
            <span>調書番号 {docNo}　{date}</span>
            <span>※本調書に法的効力はありません</span>
          </footer>
        </div>
      </article>

      <ShareActions
        coat={coatId}
        traits={traits}
        cat={cat}
        owner={owner}
        typeName={r.type.name}
        catchCopy={r.type.catch}
        gradeName={r.grade.name}
        sovereignty={r.sovereignty}
        axes={r.axes}
        evidence={r.evidence.text}
        docNo={docNo}
        date={date}
        query={`?${q.toString()}`}
        challengeQuery={`?${ch.toString()}`}
      />

      {other && cmp && (
        <section className="section" aria-labelledby="cmp">
          <h2 id="cmp"><small>VERSUS</small>二匹の調書を比較</h2>
          <div className="panel" style={{ marginTop: 0 }}>
            <div className="vs">
              <div className="who"><CatArt coat={coatId} uid="v1" traits={traits} />{cat}<small>{r.type.name}</small></div>
              <div className="x">VS</div>
              <div className="who"><CatArt coat={vsCoat} uid="v2" traits={traitsFromAxes(other.axes)} flip />{vsCat}<small>{other.type.name}</small></div>
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
                ? `支配率は${r.sovereignty}%と${other.sovereignty}%。ほぼ互角の、拮抗した主従関係です。`
                : cmp.leader === "a"
                  ? `支配率は${cat}が${r.sovereignty}%、${vsCat}が${other.sovereignty}%。${cat}家のほうが、${cmp.gap}ポイント分、下僕の労働量が多いようです。`
                  : `支配率は${cat}が${r.sovereignty}%、${vsCat}が${other.sovereignty}%。${vsCat}家のほうが、${cmp.gap}ポイント分、下僕の労働量が多いようです。`}
            </p>
          </div>
        </section>
      )}

      <p style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/chosa" className="btn ghost small">別の猫様でも調べてみる</Link>
      </p>
      <p className="disclaimer">この診断は娯楽です。結果はURLに含まれており、サーバーには保存されません。</p>
    </>
  );
}
