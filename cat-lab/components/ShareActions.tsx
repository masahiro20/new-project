"use client";

import { useState } from "react";

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** 友達に「比べっこ」の挑戦状を送る */
export function ChallengeButton({ name, relName, query }: { name: string; relName: string; query: string }) {
  const [msg, setMsg] = useState("");
  const send = async () => {
    const u = `${window.location.origin}/chosa${query}`;
    const text = `うちの${name}とわたしは【${relName}】だったよ。あなたの家の猫様は？🐾`;
    if (isMobile() && navigator.share) {
      try {
        await navigator.share({ text, url: u });
        return;
      } catch {
        /* キャンセル時はコピーに切り替える */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${u}`);
      setMsg("挑戦状をコピーしました。友達に送ってね 💌");
      setTimeout(() => setMsg(""), 3600);
    } catch {
      window.prompt("コピーしてお使いください", u);
    }
  };
  return (
    <div className="challenge">
      <p className="ch-lead">友達の猫様と比べっこしよう</p>
      <button className="btn soft block" type="button" onClick={send}>💌 挑戦状を送る</button>
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </div>
  );
}
