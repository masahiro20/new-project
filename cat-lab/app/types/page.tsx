import type { Metadata } from "next";
import Link from "next/link";
import { CatArt } from "@/components/CatArt";
import { COAT_IDS } from "@/lib/cat";
import { CAT_TYPES } from "@/lib/types";

export const metadata: Metadata = {
  title: "タイプ図鑑",
  description: "猫様と下僕の主従関係、全16タイプの図鑑です。",
};

const LABELS = ["君臨", "甘え", "気まぐれ", "要求"];

export default function Page() {
  return (
    <>
      <div className="page-title">
        <h1>タイプ図鑑 📖</h1>
        <p>4つの指標（君臨・甘え・気まぐれ・要求）の高低で、猫様は全16タイプに分けられます。</p>
      </div>
      <div className="type-list">
        {CAT_TYPES.map((t, i) => (
          <section key={t.code} id={t.code} className="type-item">
            <CatArt
              coat={COAT_IDS[i % COAT_IDS.length]}
              uid={`t-${t.code}`}
              traits={{ crown: t.code[0] === "H", blush: t.code[1] === "H", wink: t.code[2] === "H", open: t.code[3] === "H" }}
            />
            <div>
              <p className="code">{[...t.code].map((c, k) => `${LABELS[k]}${c === "H" ? "高" : "低"}`).join("・")}</p>
              <h3>{t.name}</h3>
              <p className="catch">「{t.catch}」</p>
              <p>{t.description}</p>
              <p className="adv">💡 {t.advice}</p>
            </div>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 36, textAlign: "center" }}>
        <Link href="/chosa" className="btn big">うちの子のタイプを調べる 🐾</Link>
      </p>
    </>
  );
}
