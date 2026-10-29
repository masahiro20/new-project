import type { Metadata } from "next";
import AccuracyClient from "./AccuracyClient";

export const metadata: Metadata = {
  title: "答え合わせ",
  description: "役所調査まで済んだ案件の結果と、ツールの自動判定を項目ごとに比べて正答率を出します。",
};

export default function AccuracyPage() {
  return (
    <div className="sheet sheet-page">
      <header className="page-hero">
        <div className="wrap narrow">
          <p className="page-en">Accuracy</p>
          <p className="page-kicker">答え合わせ</p>
          <h1>ツールの精度を測る</h1>
          <p className="lead">役所調査・確認申請まで済んだ案件の「正解」を貼り付けると、ツールの自動判定（用途地域・防火・建蔽率・道路の幅・接道長さ・下水・ガス）と項目ごとに比べて正答率を出します。外れやすい項目から直していきます。</p>
        </div>
      </header>
      <section className="content">
        <div className="wrap narrow">
          <AccuracyClient />
        </div>
      </section>
    </div>
  );
}
