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
    <section>
      <div className="wrap">
        <p className="eyebrow">法令チェック</p>
        <h1>住所と「何を建てたいか」を入れてください</h1>
        <p className="lead">
          住所から、用途地域・区域区分・防火指定・災害区域（国土交通省）、田畑かどうか（農林水産省）、川・水路までの距離（国土地理院）を自動で調べます。調べられないこと（計画の規模、前面道路の実測など）だけ分かる範囲で入れてください。「法令チェックを実行」で、設計で注意すること・役所への事前協議リスト・見落としチェックを条文の根拠付きでまとめます。
        </p>
        <ConsultClient accessRequired={accessRequired()} siteLookupAvailable={reinfolibAvailable()} />
      </div>
    </section>
  );
}
