"use client";

import { useRef, useState } from "react";
import { UPLOAD_MAX_FILES, UPLOAD_TOTAL_BASE64 } from "@/lib/documents";

export type Attachment = { name: string; mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"; data: string; preview?: string };

const MAX_SIDE = 1600;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Photos are shrunk to 1600px JPEG in the browser so several fit under the upload limit. */
async function shrinkImage(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像を読み込めませんでした"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { name: file.name, mediaType: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepare(file: File): Promise<Attachment> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > 3_000_000) throw new Error(`${file.name}：PDFは3MBまでです。必要なページだけにするか、圧縮してください。`);
    const dataUrl = await readAsDataUrl(file);
    return { name: file.name, mediaType: "application/pdf", data: dataUrl.split(",")[1] };
  }
  if (file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) return shrinkImage(file);
  throw new Error(`${file.name}：PDFか画像（写真・スキャン）を選んでください。`);
}

export default function Attachments({ files, onChange }: { files: Attachment[]; onChange: (files: Attachment[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = files.reduce((n, f) => n + f.data.length, 0);

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    const next = [...files];
    try {
      for (const file of Array.from(list)) {
        if (next.length >= UPLOAD_MAX_FILES) throw new Error(`添付は${UPLOAD_MAX_FILES}件までです。`);
        const a = await prepare(file);
        if (next.reduce((n, f) => n + f.data.length, 0) + a.data.length > UPLOAD_TOTAL_BASE64) throw new Error("合計の容量を超えます（目安：PDFと写真あわせて約3MB）。大きなPDFを外すか、ページを絞ってください。");
        next.push(a);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした。");
    } finally {
      onChange(next);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="field">
      <label>
        土地の資料（任意） <span className="hint">登記簿・公図・測量図・重要事項説明書のPDF、現地写真。AIが読み取って判断に使います</span>
      </label>
      <div
        className={`dropzone ${over ? "is-over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <strong>{busy ? "読み込み中…" : "ここにドラッグ、またはクリックして選ぶ"}</strong>
        <span>PDF・写真（スマホのカメラも可）／{UPLOAD_MAX_FILES}件・合計約3MBまで</span>
      </div>
      <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {error && <p className="notice" style={{ marginTop: 8 }}>{error}</p>}
      {files.length > 0 && (
        <ul className="filelist">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.preview ? <img className="thumb" src={f.preview} alt="" /> : <span className="ficon">PDF</span>}
              <span className="fname" title={f.name}>{f.name}</span>
              <span className="hint">{Math.round((f.data.length * 0.75) / 1024)}KB</span>
              <button type="button" aria-label={`${f.name} を外す`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
          <li className="hint" style={{ border: 0, background: "none", padding: "0 2px" }}>
            容量 {Math.round((used / UPLOAD_TOTAL_BASE64) * 100)}% 使用
          </li>
        </ul>
      )}
    </div>
  );
}
