import type { Metadata } from "next";
import Link from "next/link";
import { SceneArt } from "@/components/SceneArt";
import { BREED_IDS } from "@/lib/cat";
import { RELATIONS } from "@/lib/relations";

export const metadata: Metadata = {
  title: "関係図鑑",
  description: "猫様と飼い主の関係、全12タイプの図鑑です。",
};

const SHIRTS = ["#7ec8e3", "#ff9ec4", "#ffd34d", "#62d2a2", "#b48cff", "#ff8c42"];
const HAIRS = ["short", "bob", "bun", "spiky"] as const;

export default function Page() {
  return (
    <>
      <div className="page-title">
        <h1>関係図鑑 📖</h1>
        <p>猫様と飼い主の関係は、全部で12タイプ。あなたの家は、どれでしょう？</p>
      </div>
      <div className="rel-list">
        {RELATIONS.map((r, i) => (
          <section key={r.id} id={r.id} className="rel-item" style={{ ["--rel" as string]: r.color }}>
            <SceneArt
              rel={r.id}
              variant={i % 3}
              breed={BREED_IDS[(i * 7 + 3) % BREED_IDS.length]}
              traits={{}}
              human={{ hair: HAIRS[i % 4], shirt: SHIRTS[i % 6] }}
              uid={`z${i}`}
              catLine={r.catLines[0]}
              humanLine={r.humanLines[0]}
            />
            <div className="rel-body">
              <p className="no">No.{String(i + 1).padStart(2, "0")}</p>
              <h2>{r.name}</h2>
              <p className="roles-mini">猫様＝{r.catRole}　あなた＝{r.humanRole}</p>
              <p>{r.desc.replaceAll("{cat}", "猫様")}</p>
            </div>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 36, textAlign: "center" }}>
        <Link href="/chosa" className="btn big">うちの子との関係を調べる 🐾</Link>
      </p>
    </>
  );
}
