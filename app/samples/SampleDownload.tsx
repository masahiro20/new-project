"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { Part } from "@/lib/parts";

export default function SampleDownload({ part, markdown, filename }: { part: Part; markdown: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { downloadDocx } = await import("@/lib/docx-export");
      await downloadDocx(markdown, filename);
      trackEvent(`sample-download-${part}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn secondary" onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? "作成中…" : "Wordで保存"}
      </button>
      {failed && (
        <span role="alert" className="hint">
          保存できませんでした。時間をおいて再度お試しください。
        </span>
      )}
    </>
  );
}
