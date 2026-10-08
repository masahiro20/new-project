import type { Metadata } from "next";
import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { BREED_IDS } from "@/lib/cat";
import { RELATIONS } from "@/lib/relations";

export const metadata: Metadata = {
  title: "関係図鑑",
  description: "猫様と飼い主の関係、全12タイプの図鑑です。",
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <h1>関係図鑑</h1>
        <p>猫様と飼い主の関係は、全部で12タイプ。あなたの家は、どれでしょう？</p>
      </div>
      <div className="rel-list">
        {RELATIONS.map((r, i) => (
          <section key={r.id} id={r.id} className="rel-item" style={{ ["--c1" as string]: r.theme[0], ["--c2" as string]: r.theme[1], ["--accent" as string]: r.theme[2] }}>
            <div className="rel-art">
              <CatArt breed={BREED_IDS[(i * 7 + 3) % BREED_IDS.length]} uid={`z${i}`} face={r.face} acc={r.acc} />
              <span className="rel-line">「{r.catLines[0]}」</span>
            </div>
            <div className="rel-body">
              <p className="no">No.{String(i + 1).padStart(2, "0")}</p>
              <h2>{r.name}</h2>
              <p className="roles-mini">{r.catIcon} 猫様＝{r.catRole}　{r.humanIcon} あなた＝{r.humanRole}</p>
              <p>{r.desc.replaceAll("{cat}", "猫様")}</p>
              <ul className="aru mini">
                {r.aruaru.slice(0, 2).map((x) => (
                  <li key={x.label}><span>{x.label}</span>{x.text}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
      <p className="center" style={{ marginTop: 36 }}>
        <Link href="/chosa" className="btn primary big">うちの子との関係を診断する</Link>
      </p>
    </>
  );
}
