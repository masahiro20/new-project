import type { Metadata } from "next";
import ConsultClient from "./ConsultClient";
import { accessRequired } from "@/lib/access";
import { reinfolibAvailable } from "@/lib/site";

export const metadata: Metadata = {
  title: "計画の法令チェック",
  description: "計画の概要と土地情報を入力すると、適用法令・手続き・注意点・確認事項を条文の根拠付きで整理します。",
};

export default function ConsultPage() {
  return (
    <section className="consult-page">
      <div className="consult-hero no-print">
        <div className="wrap">
          <p className="kicker">
            <span className="kicker-dot" aria-hidden />
            LAND SCAN
          </p>
          <h1 className="page-title">土地を調べる</h1>
          <p className="consult-sub">住所と「何を建てたいか」だけ。土地のまとめ・案内図・法令制限確認書はその場で、AIの詳しいチェックは約3〜4分。</p>
        </div>
      </div>
      <div className="wrap">
        <ConsultClient accessRequired={accessRequired()} siteLookupAvailable={reinfolibAvailable()} />
      </div>
    </section>
  );
}
