"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COATS, type CoatId } from "@/lib/cat";
import { QUESTIONS, QUESTION_COUNT } from "@/lib/questions";
import { CatArt } from "./CatArt";

type Props = { vs?: string; vsn?: string; vsc?: string };

export function Interview({ vs, vsn, vsc }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "ask" | "busy">("intro");
  const [cat, setCat] = useState("");
  const [owner, setOwner] = useState("");
  const [coat, setCoat] = useState<CoatId>("kijitora");
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const step = answers.length;
  const catName = cat.trim() || "うちの子";

  function finish(all: number[]) {
    setPhase("busy");
    const q = new URLSearchParams({ a: all.join(""), n: catName, c: coat });
    if (owner.trim()) q.set("o", owner.trim());
    if (vs) q.set("vs", vs);
    if (vsn) q.set("vsn", vsn);
    if (vsc) q.set("vsc", vsc);
    timer.current = setTimeout(() => router.push(`/chosho?${q.toString()}`), 1800);
  }

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    timer.current = setTimeout(() => {
      const next = [...answers, i];
      setPicked(null);
      setAnswers(next);
      if (next.length === QUESTION_COUNT) finish(next);
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
        <h1>まずは、猫様のことを教えてください</h1>
        <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 14, fontWeight: 700 }}>
          全{QUESTION_COUNT}問・約3分。選ぶだけです。全部あとから変えられます。
        </p>

        <div className="field" role="radiogroup" aria-labelledby="coat-l">
          <span className="lbl" id="coat-l">毛柄をえらぶ</span>
          <div className="coats">
            {COATS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={coat === c.id}
                className="coat"
                onClick={() => setCoat(c.id)}
              >
                <CatArt coat={c.id} uid={`pick-${c.id}`} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cat">猫様のお名前（任意）</label>
          <input id="cat" value={cat} maxLength={12} onChange={(e) => setCat(e.target.value)} placeholder="例：もち" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="owner">あなたの呼び名（任意）</label>
          <input id="owner" value={owner} maxLength={10} onChange={(e) => setOwner(e.target.value)} placeholder="例：下僕その1" autoComplete="off" />
          <small>名前はサーバーに保存されません。</small>
        </div>
        <div style={{ marginTop: 26 }}>
          <button className="btn big block" type="submit">事情聴取をはじめる 🐾</button>
        </div>
      </form>
    );
  }

  if (phase === "busy") {
    return (
      <div className="panel busy" role="status" aria-live="polite">
        <CatArt coat={coat} uid="busy" traits={{ wink: true }} />
        <p>{catName}の調書を作っています…</p>
        <small>研究員が肉球スタンプを準備中です</small>
      </div>
    );
  }

  const q = QUESTIONS[step];
  const mood = step % 4 === 0 ? { blush: true } : step % 4 === 1 ? { wink: true } : step % 4 === 2 ? { open: true } : { crown: true };
  return (
    <div className="panel">
      <div className="progress" aria-label={`${step + 1}問目 / 全${QUESTION_COUNT}問`}>
        <span>{step + 1}/{QUESTION_COUNT}</span>
        <div className="track"><i style={{ width: `${((step + 1) / QUESTION_COUNT) * 100}%` }} /></div>
        <span aria-hidden="true">🐾</span>
      </div>
      <div className="q-head">
        <span className="q-no">Q{step + 1}</span>
        <CatArt coat={coat} uid="ask" traits={mood} />
      </div>
      <h2 className="q-scene">{q.scene}</h2>
      <div className="choices">
        {q.choices.map((c, i) => (
          <button key={`${step}-${i}`} type="button" className={`choice${picked === i ? " on" : ""}`} onClick={() => choose(i)}>
            {c.label}
          </button>
        ))}
      </div>
      <button type="button" className="back" onClick={back} disabled={step === 0}>← ひとつ前に戻る</button>
    </div>
  );
}
