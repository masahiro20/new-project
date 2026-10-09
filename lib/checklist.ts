// Free checklist by 減算ゼロ運営事務局 (source: peter/hq-revenue peter-hq/revenue/p0-checklist).
// Plain URLs with the base path: next/link would treat a file as a page (404 on GitHub Pages).
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const CHECKLIST = {
  title: "運営指導の前に見直す書類チェックリスト（放課後等デイサービス・児童発達支援版）",
  pdf: `${base}/downloads/unei-shidou-checklist-jidou.pdf`,
  docx: `${base}/downloads/unei-shidou-checklist-jidou.docx`,
};

/** Guides about operating inspections and the child day services that show the checklist card. */
export const CHECKLIST_GUIDES = ["unei-shidou-junbi", "unei-shidou-shiteki-jidou", "unei-shidou-tsuchi", "houkago-day-gensan", "jidou-hattatsu-gensan"];
