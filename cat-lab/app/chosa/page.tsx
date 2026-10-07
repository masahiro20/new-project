import type { Metadata } from "next";
import { Interview } from "@/components/Interview";
import { cleanName, isValidAnswers } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "事情聴取",
  description: "16の質問に答えて、猫様との主従関係を鑑定します。",
};

type SP = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const vs = first(sp.vs);
  const valid = isValidAnswers(vs);
  const vsn = valid ? cleanName(first(sp.vsn), 12, "友達の猫") : undefined;

  return (
    <>
      {valid && (
        <div className="banner">
          <b>{vsn}</b>の飼い主から、挑戦状が届いています。聴取を終えると、二匹の調書を見比べられます。
        </div>
      )}
      <Interview vs={valid ? vs : undefined} vsn={vsn} />
    </>
  );
}
