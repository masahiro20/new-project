import Link from "next/link";
import { CatMark } from "@/components/CatMark";

export default function NotFound() {
  return (
    <div className="panel" style={{ textAlign: "center" }}>
      <CatMark className="cat" />
      <h1 style={{ marginTop: 12 }}>ページが見つかりません</h1>
      <p style={{ margin: "12px 0 20px", color: "var(--muted)" }}>猫様が、書類をどこかへ持ち去った可能性があります。</p>
      <Link href="/" className="btn">トップへ戻る</Link>
    </div>
  );
}
