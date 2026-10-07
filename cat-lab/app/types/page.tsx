import type { Metadata } from "next";
import Link from "next/link";
import { CAT_TYPES } from "@/lib/types";

export const metadata: Metadata = {
  title: "タイプ図鑑",
  description: "猫様と下僕の主従関係、全16タイプの図鑑です。",
};

export default function Page() {
  return (
    <>
      <div className="page-title">
        <h1>タイプ図鑑</h1>
        <p>4つの指標（君臨・甘え・気まぐれ・要求）の高低で、猫様は全16タイプに分類されます。</p>
      </div>
      <div className="type-list">
        {CAT_TYPES.map((t) => (
          <section key={t.code} id={t.code} className="type-item">
            <p className="code">{[...t.code].map((c, i) => `${["君臨", "甘え", "気まぐれ", "要求"][i]}${c === "H" ? "高" : "低"}`).join(" / ")}</p>
            <h3>{t.name}</h3>
            <p className="catch">「{t.catch}」</p>
            <p>{t.description}</p>
            <p className="adv">下僕への助言：{t.advice}</p>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/chosa" className="btn">うちの子のタイプを調べる</Link>
      </p>
    </>
  );
}
