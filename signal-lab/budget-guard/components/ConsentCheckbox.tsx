"use client";

export type ConsentLabels = { before: string; privacy: string; middle: string; terms: string; after: string; required: string };

/**
 * 「プライバシーポリシー（外国にある第三者への提供を含む）と利用規約に同意する」.
 * Unchecked = the action is blocked here and rejected by the API (consent: true required).
 */
export function ConsentCheckbox({ labels, checked, onChange, name = "consent" }: { labels: ConsentLabels; checked: boolean; onChange: (v: boolean) => void; name?: string }) {
  return (
    <label className="consent">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="consent" />{" "}
      {labels.before}
      <a href="/legal/privacy" target="_blank" rel="noopener">{labels.privacy}</a>
      {labels.middle}
      <a href="/legal/terms" target="_blank" rel="noopener">{labels.terms}</a>
      {labels.after}
    </label>
  );
}
