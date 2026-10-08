import Link from "next/link";
import { CatArt } from "@/components/CatArt";

export default function NotFound() {
  return (
    <div className="panel busy">
      <CatArt breed="kuro" uid="nf" face="pout" />
      <h1 style={{ marginTop: 12 }}>ページが見つかりません</h1>
      <p style={{ margin: "12px 0 22px", color: "var(--muted)", fontWeight: 700 }}>猫様が、書類をどこかへ持ち去った可能性があります。</p>
      <Link href="/" className="btn primary">トップへ戻る</Link>
    </div>
  );
}
