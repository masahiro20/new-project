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
          用途地域・区域区分・防火指定・災害区域は住所から自動で調べます（国土地理院・国土交通省のデータ）。調べられないこと（地目、前面道路の実測、計画の規模）だけ分かる範囲で入れてください。右側（スマホでは下）に即時のルールチェックが出て、「法令チェックを実行」で条文を取得しながら計画に当てはめた回答を作成します。
        </p>
        <ConsultClient accessRequired={accessRequired()} siteLookupAvailable={reinfolibAvailable()} />
      </div>
    </section>
  );
}
