"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QUESTIONS, QUESTION_COUNT } from "@/lib/questions";
import { CatMark } from "./CatMark";

type Props = { vs?: string; vsn?: string };

export function Interview({ vs, vsn }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "ask" | "busy">("intro");
  const [cat, setCat] = useState("");
  const [owner, setOwner] = useState("");
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const step = answers.length;
  const catName = cat.trim() || "うちの子";

  function finish(all: number[]) {
    setPhase("busy");
    const q = new URLSearchParams({ a: all.join(""), n: catName });
    if (owner.trim()) q.set("o", owner.trim());
    if (vs) q.set("vs", vs);
    if (vsn) q.set("vsn", vsn);
    timer.current = setTimeout(() => router.push(`/chosho?${q.toString()}`), 1800);
  }

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    timer.current = setTimeout(() => {
      const next = [...answers, i];
      setPicked(null);
      if (next.length === QUESTION_COUNT) {
        setAnswers(next);
        finish(next);
      } else {
        setAnswers(next);
      }
    }, 280);
  }

  function back() {
    if (picked !== null || step === 0) return;
    setAnswers(answers.slice(0, -1));
  }

  if (phase === "intro") {
    return (
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          setPhase("ask");
        }}
      >
        <h1>事情聴取を始めます</h1>
        <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 14 }}>
          全{QUESTION_COUNT}問、所要時間は約3分です。正直にお答えください。猫様はすべてお見通しです。
        </p>
        <div className="field">
          <label htmlFor="cat">猫様のお名前（任意）</label>
          <input id="cat" value={cat} maxLength={12} onChange={(e) => setCat(e.target.value)} placeholder="例：もち" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="owner">あなたの呼び名（任意）</label>
          <input id="owner" value={owner} maxLength={10} onChange={(e) => setOwner(e.target.value)} placeholder="例：下僕その1" autoComplete="off" />
          <small>名前は調書に載るだけで、サーバーには保存されません。</small>
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="btn big" type="submit" style={{ width: "100%" }}>聴取を開始する</button>
        </div>
      </form>
    );
  }

  if (phase === "busy") {
    return (
      <div className="panel busy" role="status" aria-live="polite">
        <CatMark className="cat" />
        <p>{catName}の調書を作成中…</p>
        <small>研究員が慎重に押印しています</small>
      </div>
    );
  }

  const q = QUESTIONS[step];
  return (
    <div className="panel">
      <div className="progress" aria-label={`第${step + 1}問 / ${QUESTION_COUNT}問`}>
        <span>{step + 1} / {QUESTION_COUNT}</span>
        <div className="track"><i style={{ width: `${(step / QUESTION_COUNT) * 100}%` }} /></div>
      </div>
      <div className="q-no" style={{ marginTop: 20 }}>第{step + 1}問</div>
      <h2 className="q-scene">{q.scene}</h2>
      <div className="choices">
        {q.choices.map((c, i) => (
          <button key={`${step}-${i}`} type="button" className={`choice${picked === i ? " on" : ""}`} onClick={() => choose(i)}>
            {c.label}
          </button>
        ))}
      </div>
      <button type="button" className="back" onClick={back} disabled={step === 0}>← ひとつ前の質問に戻る</button>
    </div>
  );
}
