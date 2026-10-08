"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawCard, drawStory, type CardData, type CardPhoto } from "@/lib/card";
import { PackOpener } from "./PackOpener";

type Props = {
  data: CardData;
  docNo: string;
  /** 結果ページのクエリ（?a=...） */
  query: string;
};

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const HASH = "#猫様との関係診断 #主従研究所";

async function toBlob(cv: HTMLCanvasElement, type = "image/png", q?: number): Promise<Blob> {
  const b: Blob | null = await new Promise((res) => cv.toBlob(res, type, q));
  if (!b) throw new Error("no blob");
  return b;
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** スマホでは共有シートを開き、それ以外ではダウンロードする。共有シートを開いたら true */
async function shareOrDownload(file: File, text: string): Promise<boolean> {
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return true;
    }
  }
  download(file);
  return false;
}

export function ResultCard({ data, docNo, query }: Props) {
  const [photo, setPhoto] = useState<CardPhoto | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const onOpen = useCallback(() => setRevealed(true), []);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 3800);
  };

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    drawCard(data, photo)
      .then((cv) => toBlob(cv, "image/jpeg", 0.92))
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setImg(url);
      })
      .catch(() => alive && flash("カードの作成に失敗しました。再読み込みしてください"));
    return () => {
      alive = false;
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 3000);
    };
  }, [data, photo]);

  const text = `うちの${data.name}とわたしは【${data.rel.name}】でした🐾（${data.rarity.rank}）\n${data.name}＝${data.rel.catRole}、わたし＝${data.rel.humanRole}\n${HASH}`;
  const url = () => `${window.location.origin}/chosho${query}`;

  async function run(kind: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch {
      flash("画像の作成に失敗しました。もう一度お試しください");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const f = new File([await toBlob(await drawCard(data, photo))], `nekosama-${docNo}.png`, { type: "image/png" });
      if (!(await shareOrDownload(f, text))) flash("カードを保存しました 🐾");
    });
  const story = () =>
    run("story", async () => {
      const f = new File([await toBlob(await drawStory(data, photo))], `nekosama-story-${docNo}.png`, { type: "image/png" });
      if (!(await shareOrDownload(f, text))) flash("ストーリーズ用の画像を保存しました。Instagramから投稿してね 📸");
    });
  const x = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer");
  const line = () => window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      flash("結果のリンクをコピーしました");
    } catch {
      window.prompt("コピーしてお使いください", url());
    }
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return flash("画像ファイルを選んでください");
    try {
      const bmp = await createImageBitmap(f);
      setPhoto(bmp);
      setRevealed(true);
      flash("写真でカードをつくりました 📷");
    } catch {
      flash("この写真は読み込めませんでした");
    }
  }

  return (
    <section className="rc" aria-label="猫様カード">
      <PackOpener
        img={img}
        alt={`${data.name}とあなたは「${data.rel.name}」。${data.name}＝${data.rel.catRole}、あなた＝${data.rel.humanRole}`}
        rank={data.rarity.rank}
        name={data.name}
        opened={revealed}
        onOpen={onOpen}
      />

      {revealed && (
        <>
          <p className="rc-rarity">
            <b className={`r-${data.rarity.rank}`}>{data.rarity.rank}</b>
            {data.rarity.label}のカードが出ました！
          </p>
          <div className="rc-actions">
            <button className="btn primary block" type="button" onClick={save} disabled={!!busy}>
              {busy === "save" ? "画像をつくっています…" : "カードを保存する"}
            </button>
            <div className="sns">
              <button type="button" className="sns-btn insta" onClick={story} disabled={!!busy}>
                <span aria-hidden="true">◎</span>{busy === "story" ? "作成中…" : "ストーリーズ"}
              </button>
              <button type="button" className="sns-btn x" onClick={x}><span aria-hidden="true">𝕏</span>ポスト</button>
              <button type="button" className="sns-btn line" onClick={line}><span aria-hidden="true">💬</span>LINE</button>
              <button type="button" className="sns-btn copy" onClick={copy}><span aria-hidden="true">🔗</span>リンク</button>
            </div>
            <button type="button" className="btn photo block" onClick={() => fileRef.current?.click()}>
              📷 {photo ? "別の写真にする" : "うちの子の写真でカードをつくる"}
            </button>
            {photo && (
              <button type="button" className="link-btn" onClick={() => setPhoto(null)}>イラストに戻す</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <p className="rc-note">写真はこの端末の中だけで使われ、どこにも送信されません。カード画像は長押しでも保存できます。</p>
          </div>
        </>
      )}
      <p className="toast" role="status" aria-live="polite">{msg}</p>
    </section>
  );
}
