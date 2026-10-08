import type { Metadata } from "next";
import { CatArt } from "@/components/CatArt";
import { Interview } from "@/components/Interview";
import { isBreedId } from "@/lib/cat";
import { cleanName, isValidAnswers } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "関係性鑑定",
  description: "うちの子をえらんで、12の「もしも」の質問に答えると、あなたと猫様の関係がカードになります。",
};

type SP = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const vs = first(sp.vs);
  const valid = isValidAnswers(vs);
  const vsn = valid ? cleanName(first(sp.vsn), 12, "友達の猫") : undefined;
  const rawB = first(sp.vsb);
  const vsb = valid && isBreedId(rawB) ? rawB : undefined;

  return (
    <>
      {valid && (
        <div className="banner">
          <CatArt breed={vsb} uid="banner" face="smug" acc="crown" />
          <p><b>{vsn}</b>の飼い主さんから挑戦状！ 鑑定が終わると、二匹の結果を見比べられます。</p>
        </div>
      )}
      <Interview vs={valid ? vs : undefined} vsn={vsn} vsb={vsb} />
    </>
  );
}
