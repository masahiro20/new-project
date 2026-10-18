import type { Metadata } from "next";
import ConsultClient from "./ConsultClient";
import { accessRequired } from "@/lib/access";

export const metadata: Metadata = {
  title: "計画の法令チェック",
  description: "計画の概要と土地情報を入力すると、適用法令・手続き・注意点・確認事項を条文の根拠付きで整理します。",
};

export default function ConsultPage() {
  return (
    <section>
      <div className="wrap">
        <p className="eyebrow">法令チェック</p>
        <h1>計画の内容を教えてください</h1>
        <p className="lead">
          分かっている範囲で入力してください。入力すると右側（スマホでは下）に即時のルールチェックが出ます。「エージェントに深掘りさせる」で、条文と公的資料を取得しながら計画に当てはめた回答を作成します。
        </p>
        <ConsultClient accessRequired={accessRequired()} />
      </div>
    </section>
  );
}
