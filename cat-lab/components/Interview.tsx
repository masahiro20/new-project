"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BREEDS, getBreed, shortName } from "@/lib/breeds";
import type { BreedId } from "@/lib/cat";
import { QUESTION_COUNT } from "@/lib/questions";
import { getQuestions } from "@/lib/scoring";
import { CatArt } from "./CatArt";

type Props = { vs?: string; vsn?: string; vsb?: string };

const MOODS = ["sparkle", "wink", "grin", "smug"] as const;

export function Interview({ vs, vsn, vsb }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "ask" | "busy">("intro");
  const [tab, setTab] = useState<"柄" | "猫種">("柄");
  const [breed, setBreed] = useState<BreedId>("kijitora");
  const [cat, setCat] = useState("");
  const [owner, setOwner] = useState("");
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const step = answers.length;
  const catName = cat.trim() || "うちの子";
  const b = getBreed(breed);
  const qs = getQuestions(breed);

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish(all: number[]) {
    setPhase("busy");
    const q = new URLSearchParams({ a: all.join(""), b: breed, n: catName });
    if (owner.trim()) q.set("o", owner.trim());
    if (vs) q.set("vs", vs);
    if (vsn) q.set("vsn", vsn);
    if (vsb) q.set("vsb", vsb);
    timer.current = setTimeout(() => router.push(`/chosho?${q.toString()}`), 2000);
  }

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    timer.current = setTimeout(() => {
      const next = [...answers, i];
      setPicked(null);
      setAnswers(next);
      if (next.length === QUESTION_COUNT) finish(next);
      scrollTop();
    }, 260);
  }

  function back() {
    if (picked !== null || step === 0) return;
    setAnswers(answers.slice(0, -1));
  }

  if (phase === "intro") {
    return (
      <div ref={top}>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            setPhase("ask");
            scrollTop();
          }}
        >
          <h1 className="intro-title">うちの子を<br />えらんでください</h1>

          <div className="tabs" role="tablist" aria-label="えらび方">
            {(["柄", "猫種"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
                {t === "柄" ? `柄でえらぶ（${BREEDS.filter((x) => x.group === "柄").length}）` : `猫種でえらぶ（${BREEDS.filter((x) => x.group === "猫種").length}）`}
              </button>
            ))}
          </div>

          <div className="breeds" role="radiogroup" aria-label={tab === "柄" ? "柄" : "猫種"}>
            {BREEDS.filter((x) => x.group === tab).map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={breed === x.id}
                className="breed"
                onClick={() => setBreed(x.id)}
              >
                <CatArt breed={x.id} uid={`pick-${x.id}`} />
                <span>{shortName(x)}</span>
              </button>
            ))}
          </div>

          <div className="trait" aria-live="polite">
            <CatArt breed={breed} uid="pick-sel" face="sparkle" />
            <p><b>{b.label}</b>{b.trait}</p>
          </div>

          <div className="field">
            <label htmlFor="cat">猫様のお名前（任意）</label>
            <input id="cat" value={cat} maxLength={12} onChange={(e) => setCat(e.target.value)} placeholder="例：もち" autoComplete="off" enterKeyHint="next" />
          </div>
          <div className="field">
            <label htmlFor="owner">あなたの呼び名（任意）</label>
            <input id="owner" value={owner} maxLength={10} onChange={(e) => setOwner(e.target.value)} placeholder="例：下僕その1" autoComplete="off" enterKeyHint="done" />
            <small>名前はサーバーに保存されません。</small>
          </div>
          <button className="btn primary big block" type="submit" style={{ marginTop: 24 }}>
            {QUESTION_COUNT}の質問にすすむ 🐾
          </button>
          <p className="hint">「もしも」の質問ばかり。正解はありません。直感でどうぞ。</p>
        </form>
      </div>
    );
  }

  if (phase === "busy") {
    return (
      <div className="panel busy" role="status" aria-live="polite" ref={top}>
        <CatArt breed={breed} uid="busy" face="wink" />
        <p>{catName}との関係を鑑定中…</p>
        <small>あなただけのカードを準備しています</small>
        <div className="dots-loader" aria-hidden="true"><i /><i /><i /></div>
      </div>
    );
  }

  const q = qs[step];
  return (
    <div className="panel ask" ref={top}>
      <div className="progress" aria-label={`${step + 1}問目 / 全${QUESTION_COUNT}問`}>
        <span>{step + 1}/{QUESTION_COUNT}</span>
        <div className="track"><i style={{ width: `${((step + 1) / QUESTION_COUNT) * 100}%` }} /></div>
      </div>
      <div className="q-head">
        <span className="q-icon" aria-hidden="true">{q.icon}</span>
        {q.breed && <span className="q-badge">{shortName(b)}だけの質問</span>}
        <CatArt breed={breed} uid="ask" face={MOODS[step % 4]} />
      </div>
      <h2 className="q-scene">{q.scene.replaceAll("{cat}", catName)}</h2>
      <div className="choices">
        {q.choices.map((c, i) => (
          <button key={`${step}-${i}`} type="button" className={`choice${picked === i ? " on" : ""}`} onClick={() => choose(i)}>
            {c.label.replaceAll("{cat}", catName)}
          </button>
        ))}
      </div>
      <button type="button" className="back" onClick={back} disabled={step === 0}>← ひとつ前に戻る</button>
    </div>
  );
}
