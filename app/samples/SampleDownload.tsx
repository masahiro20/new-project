"use client";

export default function SampleDownload({ markdown, filename }: { markdown: string; filename: string }) {
  async function download() {
    const { downloadDocx } = await import("@/lib/docx-export");
    await downloadDocx(markdown, filename);
  }
  return (
    <button type="button" className="btn secondary" onClick={download}>Wordで保存</button>
  );
}
