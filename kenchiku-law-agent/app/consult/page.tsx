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
      <div className="wrap">
        <div className="no-print">
          <p className="eyebrow">法令チェック</p>
          <h1 className="page-title">住所と「何を建てたいか」だけで始められます</h1>
        </div>
        <ConsultClient accessRequired={accessRequired()} siteLookupAvailable={reinfolibAvailable()} />
      </div>
    </section>
  );
}
