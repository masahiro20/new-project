"use client";

import { trackEvent } from "@/lib/analytics";
import { CHECKLIST } from "@/lib/checklist";

/** Free checklist (A4・3ページ) by 減算ゼロ運営事務局. Counts downloads when analytics is on. */
export default function ChecklistDownload() {
  return (
    <div className="actions" style={{ marginTop: 12 }}>
      <a href={CHECKLIST.pdf} className="btn" download onClick={() => trackEvent("checklist-download-pdf")}>
        PDFで保存（A4・3ページ）
      </a>
      <a href={CHECKLIST.docx} className="btn secondary" download onClick={() => trackEvent("checklist-download-docx")}>
        Wordで保存（編集用）
      </a>
    </div>
  );
}
