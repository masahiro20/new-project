import type { Metadata } from "next";
import { aiEnabled } from "@/lib/launch";
import CheckClient from "./CheckClient";

export const metadata: Metadata = {
  title: "減算リスク無料診断（虐待防止・身体拘束・BCP）",
  description:
    "障害福祉サービス事業所が、虐待防止措置未実施減算・身体拘束廃止未実施減算・業務継続計画未策定減算の対象になっていないかを1分でチェックできる無料診断です。",
};

export default function CheckPage() {
  return (
    <section>
      <div className="wrap narrow">
        <p className="eyebrow">無料診断</p>
        <h1>減算リスクを1分でチェック</h1>
        <p className="lead">今年度の状況に当てはまるものにチェックを入れてください。入力内容は送信されません。</p>
        <CheckClient ai={aiEnabled()} />
      </div>
    </section>
  );
}
